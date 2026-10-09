// Identical in madrileno-frontend and madrileno-mobile. React Native has no navigator.locks,
// so on mobile the cross-tab path is skipped and refreshes are single-flight per process.
import { authenticatedResponseSchema } from '@/contracts/v1/auth.schemas'

export interface TokenProvider {
  jwt(): string | undefined
  refreshToken(): string | undefined
  rotated(jwt: string, refreshToken: string): void
  invalidated(): void
  subscribe(listener: () => void): () => void
}

const REFRESH_LOCK = 'madrileno.auth.refresh'

let provider: TokenProvider | null = null

export function setTokenProvider(tokenProvider: TokenProvider): void {
  provider = tokenProvider
}

async function doRefresh(baseUrl: string): Promise<string | null> {
  const p = provider
  const refreshToken = p?.refreshToken()
  if (p === null || refreshToken === undefined) return null
  let res: Response
  try {
    res = await globalThis.fetch(`${baseUrl}/v1/auth/refresh-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    // Network failure: the refresh token may still be valid — keep the session
    // and let the original 401 surface.
    return null
  }
  if (res.status === 401 || res.status === 403) {
    // Rejected. Another tab may have already spent this single-use token and
    // rotated it (synced back via the tokenStore storage listener) — only drop
    // the session if ours is still the one the backend refused.
    if (p.refreshToken() === refreshToken) p.invalidated()
    return p.jwt() ?? null
  }
  // Transient upstream failure (5xx): keep the session.
  if (res.status !== 200) return null
  const body = authenticatedResponseSchema.safeParse(await res.json())
  if (!body.success) return null
  if (p.refreshToken() !== refreshToken) return null
  p.rotated(body.data.jwt, body.data.refreshToken)
  return body.data.jwt
}

const OTHER_TAB_ROTATION_TIMEOUT_MS = 2000

function awaitOtherTabsRotation(sentJwt: string | undefined): Promise<string | null> {
  const p = provider
  if (p === null) return Promise.resolve(null)
  const rotatedJwt = (): string | null => {
    const jwt = p.jwt()
    return jwt !== undefined && jwt !== sentJwt ? jwt : null
  }
  const already = rotatedJwt()
  if (already !== null) return Promise.resolve(already)
  return new Promise((resolve) => {
    const settle = (jwt: string | null): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve(jwt)
    }
    const unsubscribe = p.subscribe(() => {
      const jwt = rotatedJwt()
      if (jwt !== null) settle(jwt)
      else if (p.jwt() === undefined) settle(null)
    })
    const timer = setTimeout(() => settle(null), OTHER_TAB_ROTATION_TIMEOUT_MS)
  })
}

async function refreshAcrossTabs(
  baseUrl: string,
  sentJwt: string | undefined,
): Promise<string | null> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks === undefined) return doRefresh(baseUrl)
  const own = await locks.request(REFRESH_LOCK, { ifAvailable: true }, async (lock) =>
    lock === null ? null : { jwt: await doRefresh(baseUrl) },
  )
  if (own !== null) return own.jwt
  return locks.request(
    REFRESH_LOCK,
    async () => (await awaitOtherTabsRotation(sentJwt)) ?? doRefresh(baseUrl),
  )
}

// Concurrent 401s must share one refresh: the refresh token is single-use.
let refreshInFlight: Promise<string | null> | null = null

function refreshOnce(baseUrl: string, sentJwt: string | undefined): Promise<string | null> {
  refreshInFlight ??= refreshAcrossTabs(baseUrl, sentJwt).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export function makeAuthorizedFetch(baseUrl: string): typeof globalThis.fetch {
  return async (input, init) => {
    // A consumed body can't be re-sent; clone before every attempt.
    const request = new Request(input, init)

    const attempt = (jwt: string | undefined): Promise<Response> => {
      const clone = request.clone()
      if (jwt === undefined) return globalThis.fetch(clone)
      const headers = new Headers(clone.headers)
      headers.set('authorization', `Bearer ${jwt}`)
      return globalThis.fetch(new Request(clone, { headers }))
    }

    const sentJwt = provider?.jwt()
    const first = await attempt(sentJwt)
    if (first.status !== 401 || provider === null || provider.refreshToken() === undefined) {
      return first
    }
    // If the token already rotated while we were in flight, retry without refreshing.
    const current = provider.jwt()
    const jwt =
      current !== undefined && current !== sentJwt ? current : await refreshOnce(baseUrl, sentJwt)
    if (jwt === null) return first
    return attempt(jwt)
  }
}
