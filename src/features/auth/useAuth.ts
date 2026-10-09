import { useCallback, useSyncExternalStore } from 'react'
import { logoutSession } from './logout'
import { tokenStore, type Tokens } from './tokenStore'

export function useAuth(): { tokens: Tokens | null; logout: () => void } {
  const tokens = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => null)
  const logout = useCallback(() => {
    void logoutSession()
  }, [])
  return { tokens, logout }
}
