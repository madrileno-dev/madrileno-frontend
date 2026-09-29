import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { orpc, type ApiClient, type OrpcUtils } from '@/api/orpc'

export type AuctionsPage = Awaited<ReturnType<ApiClient['v1']['auctions']['get']>>
export type AuctionSummary = AuctionsPage['items'][number]
export type Auction = Awaited<ReturnType<ApiClient['v1']['auctions']['byAuctionId']['get']>>
export type BidsPage = Awaited<
  ReturnType<ApiClient['v1']['auctions']['byAuctionId']['bids']['get']>
>

export const PAGE_SIZE = 12
export const BIDS_PAGE_SIZE = 10

const auctionsRoute = orpc.v1.auctions
const auctionRoute = orpc.v1.auctions.byAuctionId
const bidsRoute = orpc.v1.auctions.byAuctionId.bids

export function useAuctionsPage(offset: number) {
  return useQuery(
    auctionsRoute.get.queryOptions({
      input: { query: { limit: PAGE_SIZE, offset } },
      placeholderData: keepPreviousData,
    }),
  )
}

export function useAuction(auctionId: string) {
  return useQuery(auctionRoute.get.queryOptions({ input: { params: { auctionId } } }))
}

// Shared by the browser hook and the SSR prefetch: query keys derive from the
// input, so both sides must build it identically or hydration misses the cache.
export function bidsInfiniteOptions(utils: OrpcUtils, auctionId: string) {
  return utils.v1.auctions.byAuctionId.bids.get.infiniteOptions({
    input: (pageParam: string | undefined) => ({
      params: { auctionId },
      query: { limit: BIDS_PAGE_SIZE, 'after-id': pageParam },
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.items.at(-1)?.id : undefined),
  })
}

export function useBids(auctionId: string) {
  return useInfiniteQuery(bidsInfiniteOptions(orpc, auctionId))
}

export function usePlaceBid(auctionId: string) {
  const queryClient = useQueryClient()
  return useMutation(
    bidsRoute.post.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: auctionRoute.get.key({ input: { params: { auctionId } } }),
        })
        void queryClient.invalidateQueries({
          queryKey: bidsRoute.get.key({ input: { params: { auctionId } } }),
        })
        void queryClient.invalidateQueries({ queryKey: auctionsRoute.get.key() })
      },
    }),
  )
}
