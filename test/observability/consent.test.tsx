import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UsageDataToggle } from '@/components/usage-data-toggle'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { rumConsentStore } from '@/observability/consent'

vi.mock('@/env', () => ({
  env: {
    apiBaseUrl: '',
    rum: {
      clientToken: 't',
      site: 'localhost:5080',
      organizationIdentifier: 'default',
      applicationId: 'a',
    },
  },
}))

describe('RUM consent', () => {
  it('persists the choice and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = rumConsentStore.subscribe(listener)
    rumConsentStore.set('granted')
    rumConsentStore.set('granted')
    rumConsentStore.set('denied')
    unsubscribe()

    expect(window.localStorage.getItem('madrileno.rumConsent')).toBe('denied')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('lets the user grant and revoke from the footer', async () => {
    rumConsentStore.set('denied')
    render(
      <LocaleProvider>
        <UsageDataToggle />
      </LocaleProvider>,
    )
    expect(screen.getByText(/usage data is not shared/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(rumConsentStore.get()).toBe('granted')
    await userEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }))
    expect(rumConsentStore.get()).toBe('denied')
  })
})
