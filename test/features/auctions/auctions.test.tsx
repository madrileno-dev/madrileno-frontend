import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { tokenStore } from '@/features/auth/tokenStore'
import { App } from '@/app/App'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { server } from '../../mswServer'
import {
  AUCTION_ID,
  auctionFixture,
  auctionsPageFixture,
  bidsPageFixture,
  bidTooLowProblem,
  detailHandler,
  listHandler,
} from './mocks'

function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('auctions list', () => {
  it("renders the list on '/'", async () => {
    server.use(listHandler)
    renderApp('/')
    expect(await screen.findByText(/Château Margaux 2015/)).toBeInTheDocument()
    expect(screen.getByText(/1–1 of 1/)).toBeInTheDocument()
  })

  it('shows the empty state without a pager', async () => {
    server.use(
      http.get('*/v1/auctions', () =>
        HttpResponse.json({ ...auctionsPageFixture, items: [], total: 0 }),
      ),
    )
    renderApp('/')
    expect(await screen.findByText(/no auctions yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/of 0/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
  })

  it('keeps the list on screen and says it may be out of date when a refresh fails', async () => {
    let up = true
    server.use(
      http.get('*/v1/auctions', () =>
        up
          ? HttpResponse.json(auctionsPageFixture)
          : HttpResponse.json({ status: 503 }, { status: 503 }),
      ),
    )
    const { unmount } = renderApp('/')
    expect(await screen.findByText(/Château Margaux 2015/)).toBeInTheDocument()

    up = false
    try {
      act(() => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      })

      expect(await screen.findByText(/couldn’t refresh the auctions/i)).toBeInTheDocument()
      expect(screen.getByText(/Château Margaux 2015/)).toBeInTheDocument()
      expect(screen.queryByText(/couldn’t load auctions/i)).not.toBeInTheDocument()
    } finally {
      unmount()
      focusManager.setFocused(undefined)
    }
  })

  it('offers the way back when the next page fails to load', async () => {
    server.use(
      http.get('*/v1/auctions', ({ request }) =>
        new URL(request.url).searchParams.get('offset') === '0'
          ? HttpResponse.json({ ...auctionsPageFixture, total: 13 })
          : HttpResponse.json({ status: 503 }, { status: 503 }),
      ),
    )
    renderApp('/')
    expect(await screen.findByText(/Château Margaux 2015/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText(/couldn’t load auctions/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /previous/i }))

    expect(await screen.findByText(/Château Margaux 2015/)).toBeInTheDocument()
    expect(screen.queryByText(/couldn’t load auctions/i)).not.toBeInTheDocument()
  })
})

describe('auction detail', () => {
  it('loads more bids via the cursor (after-id)', async () => {
    const firstPage = bidsPageFixture(
      ['019ed9bb-0000-7000-8000-000000000b01', '019ed9bb-0000-7000-8000-000000000b02'],
      true,
    )
    const secondPage = bidsPageFixture(['019ed9bb-0000-7000-8000-000000000b03'], false, 2)
    server.use(
      detailHandler,
      http.get(`*/v1/auctions/${AUCTION_ID}/bids`, ({ request }) => {
        const afterId = new URL(request.url).searchParams.get('after-id')
        return HttpResponse.json(afterId === null ? firstPage : secondPage)
      }),
    )
    renderApp(`/auctions/${AUCTION_ID}`)

    expect(await screen.findByText(/bidder-0/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /load more bids/i }))
    expect(await screen.findByText(/bidder-2/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /load more bids/i })).not.toBeInTheDocument()
  })

  it('keeps the bids already shown when loading more fails', async () => {
    server.use(
      detailHandler,
      http.get(`*/v1/auctions/${AUCTION_ID}/bids`, ({ request }) =>
        new URL(request.url).searchParams.get('after-id') === null
          ? HttpResponse.json(bidsPageFixture(['019ed9bb-0000-7000-8000-000000000b01'], true))
          : HttpResponse.json({ status: 503 }, { status: 503 }),
      ),
    )
    renderApp(`/auctions/${AUCTION_ID}`)

    expect(await screen.findByText(/bidder-0/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /load more bids/i }))

    expect(await screen.findByText(/couldn’t update the bid history/i)).toBeInTheDocument()
    expect(screen.getByText(/bidder-0/)).toBeInTheDocument()
  })

  it('shows the typed rejection when a bid is too low', async () => {
    tokenStore.set({ jwt: 'jwt', refreshToken: AUCTION_ID, email: 'bidder@example.com' })
    server.use(
      detailHandler,
      http.get(`*/v1/auctions/${AUCTION_ID}/bids`, () =>
        HttpResponse.json(bidsPageFixture([], false)),
      ),
      http.post(`*/v1/auctions/${AUCTION_ID}/bids`, () =>
        HttpResponse.json(bidTooLowProblem, { status: 409 }),
      ),
    )
    renderApp(`/auctions/${AUCTION_ID}`)

    expect(
      await screen.findByRole('heading', { level: 1, name: /Château Margaux/ }),
    ).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/your bid/i), '10')
    await userEvent.click(screen.getByRole('button', { name: /place bid/i }))
    expect(
      await screen.findByText(/someone got there first. The minimum is now €300.00/i),
    ).toBeInTheDocument()
  })

  function rejectedBidAfter(
    detailAfterBid: () => Response,
    bidsAfterBid: (request: Request) => Response = () =>
      HttpResponse.json(bidsPageFixture([], false)),
    moreBidsBefore = false,
  ) {
    let bidPlaced = false
    tokenStore.set({ jwt: 'jwt', refreshToken: AUCTION_ID, email: 'bidder@example.com' })
    server.use(
      http.get(`*/v1/auctions/${AUCTION_ID}`, () =>
        bidPlaced ? detailAfterBid() : HttpResponse.json(auctionFixture),
      ),
      http.get(`*/v1/auctions/${AUCTION_ID}/bids`, ({ request }) =>
        bidPlaced
          ? bidsAfterBid(request)
          : HttpResponse.json(
              bidsPageFixture(['019ed9bb-0000-7000-8000-000000000b01'], moreBidsBefore),
            ),
      ),
      http.post(`*/v1/auctions/${AUCTION_ID}/bids`, () => {
        bidPlaced = true
        return HttpResponse.json(bidTooLowProblem, { status: 409 })
      }),
    )
  }

  async function bid(amount: string) {
    expect(
      await screen.findByRole('heading', { level: 1, name: /Château Margaux/ }),
    ).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/your bid/i), amount)
    await userEvent.click(screen.getByRole('button', { name: /place bid/i }))
  }

  it('refreshes the auction after a rejected bid and keeps the entered amount', async () => {
    rejectedBidAfter(() => HttpResponse.json({ ...auctionFixture, currentPrice: 280 }))
    renderApp(`/auctions/${AUCTION_ID}`)

    await bid('160')

    expect(await screen.findByText('€280.00')).toBeInTheDocument()
    expect(screen.getByLabelText(/your bid/i)).toHaveValue(160)
  })

  it('keeps the auction on screen and says it may be out of date when that refresh fails', async () => {
    rejectedBidAfter(() => HttpResponse.json({ status: 503 }, { status: 503 }))
    renderApp(`/auctions/${AUCTION_ID}`)

    await bid('160')

    expect(await screen.findByText(/couldn’t refresh this auction/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /Château Margaux/ })).toBeInTheDocument()
    expect(screen.getByText('€150.00')).toBeInTheDocument()
    expect(screen.getByLabelText(/your bid/i)).toHaveValue(160)
  })

  it('keeps the bid history on screen when its refresh after a rejected bid fails', async () => {
    rejectedBidAfter(
      () => HttpResponse.json(auctionFixture),
      () => HttpResponse.json({ status: 503 }, { status: 503 }),
    )
    renderApp(`/auctions/${AUCTION_ID}`)

    await bid('160')

    expect(await screen.findByText(/couldn’t update the bid history/i)).toBeInTheDocument()
    expect(screen.getByText(/bidder-0/)).toBeInTheDocument()
    expect(screen.queryByText(/couldn’t load the bid history/i)).not.toBeInTheDocument()
  })

  it('refreshes the bid history on load more after its refresh failed', async () => {
    let recovered = false
    rejectedBidAfter(
      () => HttpResponse.json(auctionFixture),
      (request) => {
        if (!recovered) return HttpResponse.json({ status: 503 }, { status: 503 })
        return new URL(request.url).searchParams.get('after-id') === null
          ? HttpResponse.json(bidsPageFixture(['019ed9bb-0000-7000-8000-000000000b05'], true, 5))
          : HttpResponse.json(bidsPageFixture(['019ed9bb-0000-7000-8000-000000000b06'], false, 6))
      },
      true,
    )
    renderApp(`/auctions/${AUCTION_ID}`)

    await bid('160')
    expect(await screen.findByText(/couldn’t update the bid history/i)).toBeInTheDocument()
    recovered = true
    await userEvent.click(screen.getByRole('button', { name: /load more bids/i }))

    expect(await screen.findByText(/bidder-5/)).toBeInTheDocument()
    expect(screen.queryByText(/couldn’t update the bid history/i)).not.toBeInTheDocument()
  })
})
