import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { tokenStore } from '@/features/auth/tokenStore'
import { useAuth } from '@/features/auth/useAuth'
import { server } from '../../mswServer'

describe('useAuth', () => {
  it('revokes the session on the server and clears it locally', async () => {
    let revoked: unknown
    server.use(
      http.post('*/v1/auth/logout', async ({ request }) => {
        revoked = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    tokenStore.set({ jwt: 'j', refreshToken: 'r', email: 'a@example.com' })
    const { result } = renderHook(() => useAuth())

    act(() => result.current.logout())

    expect(tokenStore.get()).toBeNull()
    await waitFor(() => expect(revoked).toEqual({ refreshToken: 'r' }))
  })

  it('clears the session locally even when the server is unreachable', () => {
    server.use(http.post('*/v1/auth/logout', () => HttpResponse.error()))
    tokenStore.set({ jwt: 'j', refreshToken: 'r', email: 'a@example.com' })
    const { result } = renderHook(() => useAuth())

    act(() => result.current.logout())

    expect(tokenStore.get()).toBeNull()
  })
})
