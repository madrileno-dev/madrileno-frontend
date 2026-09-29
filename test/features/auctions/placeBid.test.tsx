import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { orpc } from '@/api/orpc'
import { usePlaceBid } from '@/features/auctions/queries'
import { server } from '../../mswServer'
import { AUCTION_ID } from './mocks'

describe('usePlaceBid', () => {
  it('invalidates the auction list so it shows the new price', async () => {
    server.use(
      http.post(`*/v1/auctions/${AUCTION_ID}/bids`, () =>
        HttpResponse.json(
          {
            id: '019ed9bb-0000-7000-8000-000000000b09',
            auctionId: AUCTION_ID,
            bidderId: '019ed9bb-0000-7000-8000-0000000000bb',
            amount: 200,
            createdAt: '2026-06-16T10:00:00Z',
          },
          { status: 201 },
        ),
      ),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => usePlaceBid(AUCTION_ID), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ params: { auctionId: AUCTION_ID }, body: { amount: 200 } })
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: orpc.v1.auctions.get.key() })
  })
})
