import { dehydrate, QueryClientProvider, type DehydratedState } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { App } from './App'
import { makeQueryClient } from './queryClient'
import { ssrPrefetchers } from './ssrPrefetch'

export interface RenderResult {
  pipe: (destination: Parameters<ReturnType<typeof renderToPipeableStream>['pipe']>[0]) => void
  abort: () => void
  dehydratedState: DehydratedState
}

// Resolves on onShellReady, rejects on shell error — the caller can pipe immediately.
export async function render(
  url: string,
  apiBaseUrl: string,
  onError: (error: unknown) => void,
): Promise<RenderResult> {
  const queryClient = makeQueryClient()
  // Prefetchers are independent — pay for the slowest, not the sum.
  await Promise.all(ssrPrefetchers.map((prefetch) => prefetch(queryClient, url, apiBaseUrl)))
  const dehydratedState = dehydrate(queryClient)
  return new Promise<RenderResult>((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <StaticRouter location={url}>
            <LocaleProvider>
              <App />
            </LocaleProvider>
          </StaticRouter>
        </QueryClientProvider>
      </StrictMode>,
      {
        onShellReady() {
          resolve({ pipe, abort, dehydratedState })
        },
        onShellError(error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        },
        onError,
      },
    )
  })
}
