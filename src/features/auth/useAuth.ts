import { useCallback, useSyncExternalStore } from 'react'
import { client } from '@/api/orpc'
import { tokenStore, type Tokens } from './tokenStore'

export function useAuth(): { tokens: Tokens | null; logout: () => void } {
  const tokens = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => null)
  const logout = useCallback(() => {
    const refreshToken = tokenStore.get()?.refreshToken
    // Ends the session server-side; local state clears whatever the outcome.
    if (refreshToken !== undefined) {
      client.v1.auth.logout.post({ body: { refreshToken } }).catch(() => {})
    }
    tokenStore.set(null)
  }, [])
  return { tokens, logout }
}
