import { http, HttpResponse } from 'msw'
import type { BidTooLowExtensionError } from '@/contracts/v1/auctions.schemas'
import type { Auction, AuctionsPage, BidsPage } from '@/features/auctions/queries'

export const AUCTION_ID = '019ed9bb-0000-7000-8000-000000000001'

export const auctionFixture: Auction = {
  id: AUCTION_ID,
  sellerId: '019ed9bb-0000-7000-8000-0000000000aa',
  wineName: 'Château Margaux',
  vintage: 2015,
  color: 'Red',
  region: 'Bordeaux',
  appellation: 'Margaux',
  producerName: 'Château Margaux',
  bottleSize: 'Standard',
  bottleCount: 1,
  description: 'A fine wine',
  startingPrice: 100,
  currentPrice: 150,
  currency: 'EUR',
  status: 'Open',
  rating: null,
  startsAt: '2026-06-01T10:00:00Z',
  endsAt: '2026-07-01T10:00:00Z',
}

export const auctionsPageFixture: AuctionsPage = {
  items: [auctionFixture],
  limit: 12,
  offset: 0,
  total: 1,
}

export function bidsPageFixture(ids: readonly string[], hasMore: boolean, offset = 0): BidsPage {
  return {
    hasMore,
    items: ids.map((id, i) => ({
      id,
      amount: 150 - (offset + i) * 10,
      currency: 'EUR',
      bidderRef: `bidder-${String(offset + i)}`,
      createdAt: '2026-06-15T10:00:00Z',
    })),
  }
}

export const bidTooLowProblem: BidTooLowExtensionError = {
  type: 'result:bid-too-low',
  status: 409,
  title: 'Bid too low',
  detail: 'Your bid must be above the current price',
  instance: null,
  minAmount: 300,
}

export const listHandler = http.get('*/v1/auctions', () => HttpResponse.json(auctionsPageFixture))

export const detailHandler = http.get(`*/v1/auctions/${AUCTION_ID}`, () =>
  HttpResponse.json(auctionFixture),
)
