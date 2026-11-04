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
   - in the backend: `sbt --client testFull` writes
     `target/baklava/views/client/orpc/src`
   - here: `pnpm run sync-contracts`, which reads `../madrileno`; for a backend
     elsewhere, pass the path:
     `pnpm run sync-contracts <backend>/target/baklava/views/client/orpc/src`
   - then `pnpm run typecheck`: after an API change, each error is a call site
     to update
   - `src/contracts/` is generated: never edit it. An endpoint or field that is
     missing there is a backend change first.
2. Find the procedure. The client mirrors the URL: a kebab-case segment
   becomes camelCase, a path parameter becomes `by<Name>`, and the method is
   the last key, so `GET /v1/loans/{loanId}` is `orpc.v1.loans.byLoanId.get`. Its input is `{ params, query, body }` as
   `src/contracts/v1/<area>.contract.ts` declares; the payload types are in
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
         onSuccess: () =>
           queryClient.invalidateQueries({
             queryKey: orpc.v1.loans.byLoanId.get.key({ input: { params: { loanId } } }),
           }),
       }),
     )
   }
   ```

   - a list item type is the page type indexed: `LoansPage['items'][number]`
   - a one-off call that is not a query or a mutation, like login's, uses
     `client` from `@/api/orpc`: `await client.v1.auth.dev.post({ body: { email } })`
   - times arrive as ISO strings: convert them with `toInstant` or
     `formatInstant` from `src/api/datetime.ts`, never `Date`

4. Handle the endpoint's declared errors by code: narrow with
   `isDefinedError(error)` from `@orpc/client` and `switch` on `error.code`
   with a `never` default, so a code the backend adds or renames breaks the
   build. Anything else goes through `problemFrom(error)` from
   `src/api/problem.ts`. Never branch on the message text.
5. A public page that renders on the server prefetches its data: build the
   query options in a function that takes `OrpcUtils`, use it in both the hook
   and a prefetcher, and register the prefetcher in `src/app/ssrPrefetch.ts`.
   The two must build the same input, or hydration misses the cache.
6. Test with MSW: register handlers per test with `server.use(...)` from
   `test/mswServer.ts`, and type each fixture with the inferred type
   (`const loan: Loan = { ... }`), so a contract change breaks the fixture too.

Done when `pnpm run typecheck`, `pnpm run lint` and `pnpm run test` pass.
