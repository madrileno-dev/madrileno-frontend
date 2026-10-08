import { z } from 'zod'
import { setTokenProvider } from '@/api/authFetch'

const STORAGE_KEY = 'madrileno.tokens'

// Validate what comes back out of localStorage: anyone (an older format, a
// devtools edit) can write under our key, and a wrong shape must read as
// logged-out, not as a session with undefined fields.
const tokensSchema = z.object({
  jwt: z.string(),
  refreshToken: z.string(),
  email: z.string(),
})

export type Tokens = z.infer<typeof tokensSchema>

type Listener = () => void

const isBrowser = typeof window !== 'undefined'

function load(): Tokens | null {
  if (!isBrowser) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = tokensSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

let current: Tokens | null = load()
const listeners = new Set<Listener>()

function reload(): void {
  current = load()
  listeners.forEach((listener) => listener())
}

// Another tab rotated or dropped the tokens (the refresh token is single-use,
// so tabs must not act on a stale one) — adopt its write.
if (isBrowser) {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    reload()
  })
}

// Arrow properties: useSyncExternalStore calls them detached from the object.
export const tokenStore = {
  get: (): Tokens | null => current,
  set: (tokens: Tokens | null): void => {
    current = tokens
    if (isBrowser) {
      if (tokens !== null) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
      else window.localStorage.removeItem(STORAGE_KEY)
    }
    listeners.forEach((listener) => listener())
  },
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function registerAuthTokenProvider(): void {
  setTokenProvider({
    jwt: () => tokenStore.get()?.jwt,
    refreshToken: () => tokenStore.get()?.refreshToken,
    rotated: (jwt, refreshToken) => {
      const tokens = tokenStore.get()
      if (tokens !== null) tokenStore.set({ ...tokens, jwt, refreshToken })
    },
    invalidated: () => {
      tokenStore.set(null)
    },
    subscribe: tokenStore.subscribe,
  })
}
