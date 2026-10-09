import { client, type ApiClient } from '@/api/orpc'
import { tokenStore } from './tokenStore'

export async function logoutSession(api: ApiClient = client): Promise<void> {
  const refreshToken = tokenStore.get()?.refreshToken
  tokenStore.set(null)
  if (refreshToken === undefined) return
  await api.v1.auth.logout.post({ body: { refreshToken } }).catch(() => undefined)
}
