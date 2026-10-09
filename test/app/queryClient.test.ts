import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import { retryUnlessClientError } from '@/app/queryClient'

describe('retryUnlessClientError', () => {
  it('does not retry 4xx responses', () => {
    expect(retryUnlessClientError(0, new ORPCError('NOT_FOUND', { status: 404 }))).toBe(false)
  })

  it('retries 5xx and network errors once', () => {
    const serverError = new ORPCError('INTERNAL_SERVER_ERROR', { status: 503 })
    expect(retryUnlessClientError(0, serverError)).toBe(true)
    expect(retryUnlessClientError(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(retryUnlessClientError(1, serverError)).toBe(false)
  })
})
