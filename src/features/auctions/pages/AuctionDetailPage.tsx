import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslations } from 'use-intl'
import { z } from 'zod'
import { useInstantFormatter } from '@/api/datetime'
import { isDefinedError } from '@orpc/client'
import { problemFrom } from '@/api/problem'
import { useAuth } from '@/features/auth/useAuth'
import { usePriceFormatter } from '@/features/auctions/format'
import { useAuctionLabels } from '@/features/auctions/labels'
import {
  useAuction,
  useBids,
  usePlaceBid,
  type Auction,
  type PlaceBidError,
} from '@/features/auctions/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

function useRejectionMessage(): (error: PlaceBidError) => string {
  const t = useTranslations('auction')
  return (error) => {
    if (!isDefinedError(error)) {
      const problem = problemFrom(error)
      if (problem?.status === 401) return t('rejectAuthExpired')
      return problem?.detail ?? t('bidFailed')
    }
    const code = error.code
    switch (code) {
      case 'result:bid-too-low':
        return t('rejectBidTooLow')
      case 'result:already-highest-bidder':
        return t('rejectAlreadyHighest')
      case 'result:cannot-bid-on-own-auction':
        return t('rejectOwnAuction')
      case 'result:auction-not-open':
        return t('rejectNotOpen')
      case 'result:auction-ended':
        return t('rejectEnded')
      case 'result:auction-not-started':
        return t('rejectNotStarted')
      case 'result:auction-not-found':
        return t('rejectNotFound')
      default: {
        const unhandled: never = code
        return unhandled
      }
    }
  }
}

function PlaceBidForm({ auction }: { auction: Auction }) {
  const t = useTranslations('auction')
  const tNav = useTranslations('nav')
  const rejectionMessage = useRejectionMessage()
  const { tokens } = useAuth()
  const placeBid = usePlaceBid(auction.id)
  const bidSchema = z.object({ amount: z.coerce.number().positive(t('bidAmountPositive')) })
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof bidSchema>, unknown, z.output<typeof bidSchema>>({
    resolver: zodResolver(bidSchema),
  })

  if (tokens === null) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          {tNav('logIn')}
        </Link>
        {t('bidLoginSuffix')}
      </p>
    )
  }

  const onSubmit = handleSubmit(({ amount }) => {
    placeBid.mutate(
      { params: { auctionId: auction.id }, body: { amount } },
      {
        onSuccess: () => {
          reset()
          toast.success(t('bidPlaced'))
        },
        onError: (error) => {
          toast.error(rejectionMessage(error))
        },
      },
    )
  })

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex max-w-xs flex-col gap-3" noValidate>
      <Field data-invalid={errors.amount !== undefined}>
        <FieldLabel htmlFor="bid-amount">
          {t('bidAmountLabel', { currency: auction.currency })}
        </FieldLabel>
        <Input
          id="bid-amount"
          type="number"
          step="0.01"
          min="0"
          placeholder={String(auction.currentPrice)}
          aria-invalid={errors.amount !== undefined}
          {...register('amount')}
        />
        {errors.amount && <FieldError>{errors.amount.message}</FieldError>}
      </Field>
      <Button type="submit" disabled={placeBid.isPending || auction.status !== 'Open'}>
        {placeBid.isPending ? t('bidPlacing') : t('bidPlace')}
      </Button>
    </form>
  )
}

function BidHistory({ auctionId }: { auctionId: string }) {
  const t = useTranslations('auction')
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useBids(auctionId)
  const formatInstant = useInstantFormatter()
  const price = usePriceFormatter()
  if (isPending) return <p className="text-muted-foreground">{t('bidLoading')}</p>
  if (isError) return <p className="text-destructive">{t('bidError')}</p>
  const bids = data.pages.flatMap((page) => page.items)
  return (
    <div className="flex flex-col gap-3">
      {bids.length === 0 ? (
        <p className="text-muted-foreground">{t('bidNone')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {bids.map((bid) => (
            <li key={bid.id} className="py-2 text-sm">
              <strong>{price(bid.amount, bid.currency)}</strong>
              <span className="text-muted-foreground">
                {' '}
                {t('bidBy', { bidder: bid.bidderRef, when: formatInstant(bid.createdAt) })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? t('bidLoadingMore') : t('bidLoadMore')}
        </Button>
      )}
    </div>
  )
}

export function AuctionDetailPage() {
  const t = useTranslations('auction')
  const { auctionId } = useParams()
  // The '/auctions/:auctionId' route guarantees the param; guarding here keeps
  // the query below from ever firing with a bogus id.
  if (auctionId === undefined) return <p className="text-destructive">{t('missingId')}</p>
  return <AuctionDetail auctionId={auctionId} />
}

function AuctionDetail({ auctionId }: { auctionId: string }) {
  const t = useTranslations('auction')
  const { data: auction, isPending, isError } = useAuction(auctionId)
  const formatInstant = useInstantFormatter()
  const price = usePriceFormatter()
  const label = useAuctionLabels()

  if (isPending) return <p className="text-muted-foreground">{t('detailLoading')}</p>
  if (isError) return <p className="text-destructive">{t('detailError')}</p>

  return (
    <section className="flex flex-col gap-4">
      <title>{`${auction.wineName} — madrileno`}</title>
      <p>
        <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
          {t('detailBack')}
        </Link>
      </p>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {auction.wineName}
          {auction.vintage != null ? ` ${String(auction.vintage)}` : ''}
        </h1>
        <Badge variant={auction.status === 'Open' ? 'default' : 'secondary'}>
          {label.status(auction.status)}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {label.color(auction.color)} · {auction.region} · {auction.appellation} ·{' '}
        {auction.producerName} · {auction.bottleCount}× {label.bottleSize(auction.bottleSize)}
      </p>
      {auction.description != null && <p>{auction.description}</p>}
      <p>
        <strong className="text-lg">{price(auction.currentPrice, auction.currency)}</strong>
        <span className="text-sm text-muted-foreground">
          {' ('}
          {t('startedAt', { price: price(auction.startingPrice, auction.currency) })}
          {') · '}
          {t('ends', { when: formatInstant(auction.endsAt) })}
        </span>
      </p>
      <PlaceBidForm auction={auction} />
      <h2 className="mt-2 text-lg font-semibold">{t('bidHistory')}</h2>
      <BidHistory auctionId={auction.id} />
    </section>
  )
}
