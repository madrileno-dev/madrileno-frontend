---
name: frontend-use-api
description: Call a backend endpoint from this app, or follow a change in the backend's API. Syncs the generated oRPC contract, then queries and mutates through `orpc` with types inferred from it. Use before writing any request, response type, schema or fetch call for the API.
---

# Use the API

The backend's router specs generate a typed oRPC contract; this app vendors it
in `src/contracts/` and calls every endpoint through it. Never hand-write a
request or response type, a zod schema for an API payload, or a `fetch` call to
the API: they drift from the backend without a compile error.

1. Sync the contract:
   - in the backend, run the router specs you changed, unfiltered:
     `sbt --client "testOnly <pkg>.<module>.*"`. Every test run regenerates
     the whole contract in `target/baklava/views/client/orpc/src` from the
     last results of every suite, so that is enough.
   - in a fresh backend checkout there are no stored results yet: run
     `sbt --client testFull` once first. A synced contract that has lost whole
     areas, with typecheck failing everywhere, is the sign this was skipped.
   - here: `pnpm run sync-contracts`, which reads `../madrileno`; for a backend
     elsewhere, pass the path:
     `pnpm run sync-contracts <backend>/target/baklava/views/client/orpc/src`
   - then `pnpm run typecheck`: after an API change, each error is a call site
     to update
   - `src/contracts/` is generated: never edit it. An endpoint or field that is
     missing there is a backend change first.
2. Find the procedure. The client mirrors the URL: a kebab-case segment
   becomes camelCase, a path parameter becomes `by<Name>`, and the method is
   the last key, so `GET /v1/loans/{loanId}` is `orpc.v1.loans.byLoanId.get`.
   Its input is `{ params, query, body }` as
   `src/contracts/v1/<area>.contract.ts` declares, with query parameter names
   as on the wire (`query: { 'due-before': ... }`); the payload types are in
   `<area>.schemas.ts` next to it.
3. Put the hooks in `src/features/<feature>/queries.ts` and infer every type
   from `ApiClient`:

   ```ts
   import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
   import { orpc, type ApiClient } from '@/api/orpc'

   export type Loan = Awaited<ReturnType<ApiClient['v1']['loans']['byLoanId']['get']>>

   export function useLoan(loanId: string) {
     return useQuery(orpc.v1.loans.byLoanId.get.queryOptions({ input: { params: { loanId } } }))
   }

   export function useReturnLoan(loanId: string) {
     const queryClient = useQueryClient()
     return useMutation(
       orpc.v1.loans.byLoanId.return.post.mutationOptions({
         onSettled: () => {
           void queryClient.invalidateQueries({
             queryKey: orpc.v1.loans.byLoanId.get.key({ input: { params: { loanId } } }),
           })
         },
       }),
     )
   }

   export type ReturnLoanError = NonNullable<ReturnType<typeof useReturnLoan>['error']>
   ```

   - a mutation takes the whole input when called:
     `returnLoan.mutate({ params: { loanId } })`
   - refresh what a mutation touched in `onSettled`, not `onSuccess`: a
     rejection such as "already returned" usually means the screen was stale,
     and only a refetch shows the user the current state. Reset the form on
     success only, so a rejected attempt keeps what the user typed. Don't
     return the `invalidateQueries` promise: the mutation would stay pending
     until the refetch finished, holding back the rejection message
   - when that refetch fails, the query keeps its old data: keep showing it
     and say it may be out of date, as `AuctionsPage` does for the list and
     `AuctionDetailPage` for the auction and its bid history. Show "couldn't load" only on
     `isLoadingError`; `isError` is also true while old data is on screen.
     For the note, a single query checks `isRefetchError`. An infinite list,
     after returning early on `isLoadingError`, checks `isError`: a failed
     "load more" sets `isFetchNextPageError` and leaves `isRefetchError`
     false, so checking `isRefetchError` would say nothing. With
     `keepPreviousData`, the previous page shows only while the next one
     loads: if that fails, `data` is gone and `isLoadingError` is true, so
     keep a way back, as `AuctionsPage` does with "← Previous"
   - a list item type is the page type indexed: `LoansPage['items'][number]`
   - a one-off call that is not a query or a mutation, like login's, uses
     `client` from `@/api/orpc`: `await client.v1.auth.dev.post({ body: { email } })`
   - times arrive as ISO strings. In a component, format them with the
     function `useInstantFormatter()` from `src/api/datetime.ts` returns: it
     applies the user's locale and renders the same text on the server and in
     the browser. Compare or compute with `toInstant`. Never use `Date`.

4. Handle the endpoint's declared errors by code, with the error typed from
   the hook (`ReturnLoanError` above). Take the code into a variable before the
   `switch`, and end it with a `never` default, so a code the backend adds or
   renames breaks the build:

   ```ts
   if (!isDefinedError(error)) return problemFrom(error)?.detail ?? t('returnFailed')
   const code = error.code
   switch (code) {
     case 'result:loan-not-found':
       return t('loanNotFound')
     case 'result:loan-already-returned':
       return t('loanAlreadyReturned')
     default: {
       const unhandled: never = code
       return unhandled
     }
   }
   ```

   `isDefinedError` is from `@orpc/client`, `problemFrom` from
   `src/api/problem.ts`. Never branch on the message text.

5. A public page that renders on the server prefetches its data: build the
   query options in a function that takes `OrpcUtils`, and call it with `orpc`
   in the hook and with `makeOrpcUtils(apiBaseUrl)` in a prefetcher. The two
   must build the same input, or hydration misses the cache. A prefetcher is a
   `Prefetcher` (`(queryClient, url, apiBaseUrl) => Promise<void>`) registered
   in `src/app/ssrPrefetch.ts`; every one runs on every server render, so it
   matches its route with `matchPath` first, and it uses `prefetchQuery`,
   which does not throw when the backend is down.
6. Test with MSW: register handlers per test with `server.use(...)` from
   `test/mswServer.ts`, match the URL with a leading `*`
   (`http.get('*/v1/loans/:loanId', ...)`), and type each fixture with the
   inferred type (`const loan: Loan = { ... }`), so a contract change breaks
   the fixture too.

Done when, after `pnpm run format`, `pnpm run typecheck`, `pnpm run lint` and
`pnpm run test` pass.
