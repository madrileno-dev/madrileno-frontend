import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeApiClient } from '@/api/orpc'
import { logoutSession } from '@/features/auth/logout'
import { registerAuthTokenProvider, tokenStore } from '@/features/auth/tokenStore'
import { server } from '../../mswServer'

const BASE = 'http://api.test'
const SESSION = { jwt: 'jwt', refreshToken: 'rt-1', email: 'a@example.com' }

beforeAll(() => {
  registerAuthTokenProvider()
})

describe('logoutSession', () => {
  it('clears the tokens and revokes the session on the server', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(`${BASE}/v1/auth/logout`, async ({ request }) => {
        bodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    tokenStore.set(SESSION)
    await logoutSession(makeApiClient(BASE))
    expect(tokenStore.get()).toBeNull()
    expect(bodies).toEqual([{ refreshToken: 'rt-1' }])
  })

  it('clears the tokens even when the server call fails', async () => {
    server.use(http.post(`${BASE}/v1/auth/logout`, () => HttpResponse.error()))
    tokenStore.set(SESSION)
    await logoutSession(makeApiClient(BASE))
    expect(tokenStore.get()).toBeNull()
  })

  it('does not call the server when there is no session', async () => {
    await logoutSession(makeApiClient(BASE))
    expect(tokenStore.get()).toBeNull()
  })
})
