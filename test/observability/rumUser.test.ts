import { describe, expect, it } from 'vitest'
import { trackRumUser, userIdFrom } from '@/observability/rumUser'

function jwtFor(claims: object): string {
  const b64url = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url({ alg: 'HS256' })}.${b64url(claims)}.sig`
}

function fakeTokens(jwt: string | null) {
  let current = jwt === null ? null : { jwt }
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (next: string | null) => {
      current = next === null ? null : { jwt: next }
      listeners.forEach((listener) => listener())
    },
  }
}

describe('userIdFrom', () => {
  it('reads the userId claim', () => {
    expect(userIdFrom(jwtFor({ userId: 'u-1', emailVerified: true }))).toBe('u-1')
  })

  it('returns null for a malformed token or a missing claim', () => {
    expect(userIdFrom('not-a-jwt')).toBeNull()
    expect(userIdFrom('a.%%%.c')).toBeNull()
    expect(userIdFrom(jwtFor({ sub: 'u-1' }))).toBeNull()
  })
})

describe('trackRumUser', () => {
  it('sets the user on login, keeps it across rotations, and clears it on logout', () => {
    const tokens = fakeTokens(null)
    const calls: string[] = []
    trackRumUser(tokens, { set: (id) => calls.push(`set ${id}`), clear: () => calls.push('clear') })

    tokens.set(jwtFor({ userId: 'u-1', iat: 1 }))
    tokens.set(jwtFor({ userId: 'u-1', iat: 2 }))
    tokens.set(jwtFor({ userId: 'u-2' }))
    tokens.set(null)

    expect(calls).toEqual(['set u-1', 'set u-2', 'clear'])
  })

  it('sets an already signed-in user immediately and stops on unsubscribe', () => {
    const tokens = fakeTokens(jwtFor({ userId: 'u-1' }))
    const calls: string[] = []
    const stop = trackRumUser(tokens, {
      set: (id) => calls.push(`set ${id}`),
      clear: () => calls.push('clear'),
    })
    stop()
    tokens.set(null)

    expect(calls).toEqual(['set u-1'])
  })
})
