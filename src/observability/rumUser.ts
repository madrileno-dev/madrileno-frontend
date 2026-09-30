import { z } from 'zod'

const claimsSchema = z.object({ userId: z.string().min(1) })

export function userIdFrom(jwt: string): string | null {
  const payload = jwt.split('.')[1]
  if (payload === undefined) return null
  try {
    const base64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const claims = claimsSchema.safeParse(JSON.parse(atob(base64)))
    return claims.success ? claims.data.userId : null
  } catch {
    return null
  }
}

interface TokenSource {
  get: () => { jwt: string } | null
  subscribe: (listener: () => void) => () => void
}

// Id only, no email; sent when the user changes, not on every rotation.
export function trackRumUser(
  tokens: TokenSource,
  rum: { set: (id: string) => void; clear: () => void },
): () => void {
  let current: string | null = null
  const sync = (): void => {
    const jwt = tokens.get()?.jwt
    const id = jwt === undefined ? null : userIdFrom(jwt)
    if (id === current) return
    current = id
    if (id === null) rum.clear()
    else rum.set(id)
  }
  sync()
  return tokens.subscribe(sync)
}
