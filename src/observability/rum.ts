import { env } from '@/env'
import { tokenStore } from '@/features/auth/tokenStore'
import { trackRumUser } from './rumUser'

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
  openobserveRum.init({
    applicationId: cfg.applicationId,
    ...common,
    trackResources: true,
    trackLongTasks: true,
    trackUserInteractions: true,
    allowedTracingUrls: [{ match: `${apiOrigin()}/v1/`, propagatorTypes: ['tracecontext'] }],
    defaultPrivacyLevel: 'mask-user-input',
  })
  openobserveLogs.init({ ...common, forwardErrorsToLogs: true })
  trackRumUser(tokenStore, {
    set: (id) => openobserveRum.setUser({ id }),
    clear: () => openobserveRum.clearUser(),
  })
  openobserveRum.startSessionReplayRecording()
}
