import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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
})
