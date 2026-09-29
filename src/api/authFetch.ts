import { authenticatedResponseSchema } from '@/contracts/v1/auth.schemas'

export interface TokenProvider {
  jwt(): string | undefined
  refreshToken(): string | undefined
  rotated(jwt: string, refreshToken: string): void
  invalidated(): void
}

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
  // The session changed while this refresh was in flight (logout, or a login as
  // someone else): these tokens belong to the old session, so drop them.
  if (p.refreshToken() !== refreshToken) return null
  p.rotated(body.data.jwt, body.data.refreshToken)
  return body.data.jwt
}

// Concurrent 401s must share one refresh: the refresh token is single-use.
let refreshInFlight: Promise<string | null> | null = null

function refreshOnce(baseUrl: string): Promise<string | null> {
  refreshInFlight ??= doRefresh(baseUrl).finally(() => {
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
    const jwt = current !== undefined && current !== sentJwt ? current : await refreshOnce(baseUrl)
    if (jwt === null) return first
    return attempt(jwt)
  }
}
