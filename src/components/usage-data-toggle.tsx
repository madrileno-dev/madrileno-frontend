import { useSyncExternalStore } from 'react'
import { useTranslations } from 'use-intl'
import { useHydrated } from '@/api/hydration'
import { Button } from '@/components/ui/button'
import { env } from '@/env'
import { rumConsentStore } from '@/observability/consent'

export function UsageDataToggle() {
  const t = useTranslations('consent')
  const hydrated = useHydrated()
  const consent = useSyncExternalStore(rumConsentStore.subscribe, rumConsentStore.get, () => null)
  if (env.rum === null || !hydrated) return null
  const granted = consent === 'granted'
  return (
    <p className="text-sm text-muted-foreground">
      {t(granted ? 'statusGranted' : 'statusDenied')}{' '}
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0"
        onClick={() => rumConsentStore.set(granted ? 'denied' : 'granted')}
      >
        {t(granted ? 'revoke' : 'allow')}
      </Button>
    </p>
  )
}
