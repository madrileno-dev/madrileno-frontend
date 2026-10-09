import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslations } from 'use-intl'
import { useInstantFormatter } from '@/api/datetime'
import { usePriceFormatter } from '@/features/auctions/format'
import { PAGE_SIZE, useAuctionsPage, type AuctionSummary } from '@/features/auctions/queries'
import { useAuctionLabels } from '@/features/auctions/labels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function AuctionCard({ auction }: { auction: AuctionSummary }) {
  const t = useTranslations('auction')
  const formatInstant = useInstantFormatter()
  const price = usePriceFormatter()
  const label = useAuctionLabels()
  return (
    <li>
      <Card className="h-full">
        <CardHeader>
          <CardTitle>
            <Link
              to={`/auctions/${auction.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {auction.wineName}
              {auction.vintage != null ? ` ${String(auction.vintage)}` : ''}
            </Link>
          </CardTitle>
          <CardAction>
            <Badge variant={auction.status === 'Open' ? 'default' : 'secondary'}>
              {label.status(auction.status)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            {label.color(auction.color)} · {auction.region} · {auction.producerName}
          </p>
          <p className="mt-auto">
            <strong className="text-base">{price(auction.currentPrice, auction.currency)}</strong>
            <span className="text-muted-foreground">
              {' · '}
              {t('ends', { when: formatInstant(auction.endsAt) })}
            </span>
          </p>
        </CardContent>
      </Card>
    </li>
  )
}

export function AuctionsPage() {
  const t = useTranslations('auction')
  const [offset, setOffset] = useState(0)
  const { data: page, isPending, isError } = useAuctionsPage(offset)

  return (
    <section className="flex flex-col gap-6">
      <title>{t('listPageTitle')}</title>
      <h1 className="text-2xl font-semibold">{t('listHeading')}</h1>
      {isPending && <p className="text-muted-foreground">{t('loadingList')}</p>}
      {isError && <p className="text-destructive">{t('errorList')}</p>}
      {page &&
        (page.items.length === 0 ? (
          <p className="text-muted-foreground">{t('empty')}</p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {page.items.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </ul>
            <nav className="flex items-center justify-between gap-4">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t('prev')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('pageRange', {
                  from: offset + 1,
                  to: Math.min(offset + PAGE_SIZE, page.total),
                  total: page.total,
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= page.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t('next')}
              </Button>
            </nav>
          </>
        ))}
    </section>
  )
}
