import { useTranslations } from 'use-intl'
import type { AuctionSummary } from '@/features/auctions/queries'

const STATUS = {
  Open: 'statusOpen',
  Closed: 'statusClosed',
  Cancelled: 'statusCancelled',
} as const satisfies Record<AuctionSummary['status'], string>

const COLOR = {
  Dessert: 'colorDessert',
  Fortified: 'colorFortified',
  Orange: 'colorOrange',
  Red: 'colorRed',
  Rose: 'colorRose',
  Sparkling: 'colorSparkling',
  White: 'colorWhite',
} as const satisfies Record<AuctionSummary['color'], string>

const BOTTLE_SIZE = {
  Half: 'bottleHalf',
  Standard: 'bottleStandard',
  Magnum: 'bottleMagnum',
  DoubleMagnum: 'bottleDoubleMagnum',
  Jeroboam: 'bottleJeroboam',
  Other: 'bottleOther',
} as const satisfies Record<AuctionSummary['bottleSize'], string>

export function useAuctionLabels() {
  const t = useTranslations('auction')
  return {
    status: (status: AuctionSummary['status']) => t(STATUS[status]),
    color: (color: AuctionSummary['color']) => t(COLOR[color]),
    bottleSize: (size: AuctionSummary['bottleSize']) => t(BOTTLE_SIZE[size]),
  }
}
