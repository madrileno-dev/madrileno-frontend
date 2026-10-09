import { ORPCError } from '@orpc/client'
import { QueryClient } from '@tanstack/react-query'

export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ORPCError && error.status < 500) return false
  return failureCount < 1
}

// Fresh client per SSR request; staleTime > 0 so hydrated data isn't refetched immediately.
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: retryUnlessClientError },
    },
  })
}
