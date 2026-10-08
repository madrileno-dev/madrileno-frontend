import { http, HttpResponse } from 'msw'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { registerAuthTokenProvider, tokenStore } from '@/features/auth/tokenStore'
import { server } from '../mswServer'
import { makeApiClient } from '@/api/orpc'

const BASE = 'http://api.test'
const USER = { id: '019ed9bb-0000-7000-8000-000000000042', emailVerified: true }
const REFRESHED = {
  jwt: 'fresh-jwt',
  refreshToken: '22222222-2222-4222-8222-222222222222',
  userCreated: false,
}

beforeAll(() => {
  registerAuthTokenProvider()
})

function fakeLockManager() {
  const tails = new Map<string, Promise<unknown>>()
  const held = new Set<string>()
  return {
    request: <T>(
      name: string,
      optionsOrCallback: { ifAvailable?: boolean } | ((lock: object | null) => Promise<T>),
      maybeCallback?: (lock: object | null) => Promise<T>,
    ): Promise<T> => {
      const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!
      if (options.ifAvailable === true && held.has(name)) return callback(null)
      const previous = tails.get(name) ?? Promise.resolve()
      const run = previous.then(async () => {
        held.add(name)
        try {
          return await callback({ name })
        } finally {
          held.delete(name)
        }
      })
      tails.set(
        name,
        run.catch(() => undefined),
      )
      return run
    },
  }
}

function installFakeLocks() {
  Object.defineProperty(navigator, 'locks', { value: fakeLockManager(), configurable: true })
}

afterEach(() => {
  delete (navigator as { locks?: unknown }).locks
})

function loggedIn() {
  tokenStore.set({
    jwt: 'stale-jwt',
    refreshToken: '11111111-1111-4111-8111-111111111111',
    email: 'test@example.com',
  })
}

function usersMe401Until(fresh: string) {
  return http.get(`${BASE}/v1/users/me`, ({ request }) => {
    if (request.headers.get('authorization') === `Bearer ${fresh}`) {
      return HttpResponse.json(USER)
    }
    return HttpResponse.json(
      { type: 'rejection:authentication-failed', status: 401, title: 'Could not authorize' },
      { status: 401 },
    )
  })
}

describe('the authorized fetch behind the oRPC client', () => {
  it('injects the bearer token, refreshes once on 401, and retries', async () => {
    loggedIn()
    let refreshCalls = 0
    server.use(
      usersMe401Until('fresh-jwt'),
      http.post(`${BASE}/v1/auth/refresh-token`, () => {
        refreshCalls += 1
        return HttpResponse.json(REFRESHED)
      }),
    )

    const user = await makeApiClient(BASE).v1.users.me.get()

    expect(user.id).toBe(USER.id)
    expect(refreshCalls).toBe(1)
    expect(tokenStore.get()?.jwt).toBe('fresh-jwt')
    expect(tokenStore.get()?.refreshToken).toBe(REFRESHED.refreshToken)
  })

  it('deduplicates concurrent 401s into a single refresh (token rotation safety)', async () => {
    loggedIn()
    let refreshCalls = 0
    server.use(
      usersMe401Until('fresh-jwt'),
      http.post(`${BASE}/v1/auth/refresh-token`, async () => {
        refreshCalls += 1
        // Delay so the second 401 arrives while the first refresh is in flight.
        await new Promise((r) => setTimeout(r, 25))
        return HttpResponse.json(REFRESHED)
      }),
    )

    const client = makeApiClient(BASE)
    const [a, b] = await Promise.all([client.v1.users.me.get(), client.v1.users.me.get()])

    expect(refreshCalls).toBe(1)
    expect(a.id).toBe(USER.id)
    expect(b.id).toBe(USER.id)
    expect(tokenStore.get()?.jwt).toBe('fresh-jwt')
  })

  it('keeps the session when the refresh endpoint fails transiently (5xx)', async () => {
    loggedIn()
    server.use(
      usersMe401Until('fresh-jwt'),
      http.post(`${BASE}/v1/auth/refresh-token`, () =>
        HttpResponse.json(
          { type: 'about:blank', status: 502, title: 'Upstream unavailable' },
          { status: 502 },
        ),
      ),
    )

    // The original 401 surfaces as the request error…
    await expect(makeApiClient(BASE).v1.users.me.get()).rejects.toThrow()
    // …but the still-valid refresh token survives the blip.
    expect(tokenStore.get()?.refreshToken).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('keeps the session when the refresh request fails at the network level', async () => {
    loggedIn()
    server.use(
      usersMe401Until('fresh-jwt'),
      http.post(`${BASE}/v1/auth/refresh-token`, () => HttpResponse.error()),
    )

    await expect(makeApiClient(BASE).v1.users.me.get()).rejects.toThrow()
    expect(tokenStore.get()?.refreshToken).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('logs out when the refresh token is rejected (the 401 propagates as an error)', async () => {
    loggedIn()
    const reject401 = () =>
      HttpResponse.json(
        { type: 'rejection:authentication-failed', status: 401, title: 'Could not authorize' },
        { status: 401 },
      )
    server.use(
      http.get(`${BASE}/v1/users/me`, reject401),
      http.post(`${BASE}/v1/auth/refresh-token`, reject401),
    )

    await expect(makeApiClient(BASE).v1.users.me.get()).rejects.toThrow()
    expect(tokenStore.get()).toBeNull()
  })

  it('sends no bearer header when logged out', async () => {
    tokenStore.set(null)
    let sawAuthHeader: string | null = 'unset'
    server.use(
      http.get(`${BASE}/v1/users/me`, ({ request }) => {
        sawAuthHeader = request.headers.get('authorization')
        return HttpResponse.json(USER)
      }),
    )

    const user = await makeApiClient(BASE).v1.users.me.get()

    expect(user.id).toBe(USER.id)
    expect(sawAuthHeader).toBeNull()
  })

  it('drops refreshed tokens when the session changed while the refresh was in flight', async () => {
    loggedIn()
    let refreshStarted = false
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      usersMe401Until('fresh-jwt'),
      http.post(`${BASE}/v1/auth/refresh-token`, async () => {
        refreshStarted = true
        await gate
        return HttpResponse.json(REFRESHED)
      }),
    )

    const call = makeApiClient(BASE).v1.users.me.get()
    while (!refreshStarted) await new Promise((r) => setTimeout(r, 5))
    const other = {
      jwt: 'other-jwt',
      refreshToken: '33333333-3333-4333-8333-333333333333',
      email: 'other@example.com',
    }
    tokenStore.set(other)
    release()

    await expect(call).rejects.toThrow()
    expect(tokenStore.get()).toEqual(other)
  })

  it('refreshes under the cross-tab lock when Web Locks is available', async () => {
    installFakeLocks()
    loggedIn()
    let refreshCalls = 0
    server.use(
      usersMe401Until('fresh-jwt'),
      http.post(`${BASE}/v1/auth/refresh-token`, () => {
        refreshCalls += 1
        return HttpResponse.json(REFRESHED)
      }),
    )

    const user = await makeApiClient(BASE).v1.users.me.get()

    expect(user.id).toBe(USER.id)
    expect(refreshCalls).toBe(1)
    expect(tokenStore.get()?.jwt).toBe('fresh-jwt')
  })

  it('adopts a rotation another tab completed while this tab waited for the lock, even when its localStorage write lands after the lock is released', async () => {
    installFakeLocks()
    loggedIn()
    let refreshCalls = 0
    let releaseOtherTab!: () => void
    const otherTabDone = new Promise<void>((resolve) => {
      releaseOtherTab = resolve
    })
    server.use(
      usersMe401Until('other-tab-jwt'),
      http.post(`${BASE}/v1/auth/refresh-token`, () => {
        refreshCalls += 1
        return HttpResponse.json(REFRESHED)
      }),
    )

    const otherTab = navigator.locks.request('madrileno.auth.refresh', async () => {
      await otherTabDone
    })

    const call = makeApiClient(BASE).v1.users.me.get()
    await new Promise((r) => setTimeout(r, 10))
    releaseOtherTab()
    await otherTab
    await new Promise((r) => setTimeout(r, 20))
    window.localStorage.setItem(
      'madrileno.tokens',
      JSON.stringify({
        jwt: 'other-tab-jwt',
        refreshToken: '33333333-3333-4333-8333-333333333333',
        email: 'test@example.com',
      }),
    )
    window.dispatchEvent(new StorageEvent('storage', { key: 'madrileno.tokens' }))

    const user = await call
    expect(user.id).toBe(USER.id)
    expect(refreshCalls).toBe(0)
    expect(tokenStore.get()?.jwt).toBe('other-tab-jwt')
    expect(tokenStore.get()?.refreshToken).toBe('33333333-3333-4333-8333-333333333333')
  })
})
