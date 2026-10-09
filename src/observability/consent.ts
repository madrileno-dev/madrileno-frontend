import { z } from 'zod'

const KEY = 'madrileno.rumConsent'

const consentSchema = z.enum(['granted', 'denied'])
export type RumConsent = z.infer<typeof consentSchema>

function read(): RumConsent | null {
  if (typeof window === 'undefined') return null
  const parsed = consentSchema.safeParse(window.localStorage.getItem(KEY))
  return parsed.success ? parsed.data : null
}

type Listener = () => void

let current = read()
const listeners = new Set<Listener>()

// null until the user has chosen; RUM sends nothing until then.
export const rumConsentStore = {
  get: (): RumConsent | null => current,
  set: (consent: RumConsent): void => {
    if (consent === current) return
    current = consent
    window.localStorage.setItem(KEY, consent)
    listeners.forEach((listener) => listener())
  },
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
