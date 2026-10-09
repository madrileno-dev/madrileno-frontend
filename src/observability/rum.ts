import { toast } from 'sonner'
import { createTranslator } from 'use-intl/core'
import { env } from '@/env'
import { tokenStore } from '@/features/auth/tokenStore'
import { messages } from '@/i18n/config'
import { rumConsentStore } from './consent'
import { trackRumUser } from './rumUser'

const t = createTranslator({ locale: 'en', messages, namespace: 'consent' })

function apiOrigin(): string {
  return env.apiBaseUrl !== '' ? new URL(env.apiBaseUrl).origin : window.location.origin
}

export async function initRum(): Promise<void> {
  const cfg = env.rum
  if (cfg === null) return
  const [{ openobserveRum }, { openobserveLogs }] = await Promise.all([
    import('@openobserve/browser-rum'),
    import('@openobserve/browser-logs'),
  ])
  const common = {
    clientToken: cfg.clientToken,
    site: cfg.site,
    organizationIdentifier: cfg.organizationIdentifier,
    service: 'madrileno-frontend',
    env: import.meta.env.MODE,
    version: '0.0.0',
    insecureHTTP: cfg.site.startsWith('localhost'),
    apiVersion: 'v1',
  }
  const consent = () => (rumConsentStore.get() === 'granted' ? 'granted' : 'not-granted')
  openobserveRum.init({
    applicationId: cfg.applicationId,
    ...common,
    trackResources: true,
    trackLongTasks: true,
    trackUserInteractions: true,
    allowedTracingUrls: [{ match: `${apiOrigin()}/v1/`, propagatorTypes: ['tracecontext'] }],
    defaultPrivacyLevel: 'mask-user-input',
    trackingConsent: consent(),
  })
  openobserveLogs.init({ ...common, forwardErrorsToLogs: true, trackingConsent: consent() })
  rumConsentStore.subscribe(() => {
    openobserveRum.setTrackingConsent(consent())
    openobserveLogs.setTrackingConsent(consent())
  })
  if (rumConsentStore.get() === null) {
    toast(t('prompt'), {
      duration: Infinity,
      action: { label: t('allow'), onClick: () => rumConsentStore.set('granted') },
      cancel: { label: t('decline'), onClick: () => rumConsentStore.set('denied') },
    })
  }
  trackRumUser(tokenStore, {
    set: (id) => openobserveRum.setUser({ id }),
    clear: () => openobserveRum.clearUser(),
  })
  openobserveRum.startSessionReplayRecording()
}
