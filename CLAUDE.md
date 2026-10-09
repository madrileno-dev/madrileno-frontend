You are an expert frontend engineer. This is the reference frontend for the
madrileno backend template (sibling repo `../madrileno`).

# Ground rules

- The API contract in `src/contracts/` is GENERATED — never edit it. Refresh it
  with `pnpm run sync-contracts` after the backend's `sbt testFull`. If typecheck
  breaks after a sync, fix the call sites: the backend routes are the source of
  truth.
- ALWAYS run `pnpm run typecheck`, `pnpm run lint`, and `pnpm run test` before
  committing; format with `pnpm run format`.
- NEVER use the JS `Date` global outside `src/api/datetime.ts` (ESLint enforces
  this). Use `Temporal` from `temporal-polyfill`; convert wire values at the
  boundary with `toInstant` / `formatInstant`.
- User-facing text goes through use-intl: add the key to
  `src/i18n/messages/en.json`, then render `t('key', { param })` from
  `useTranslations('namespace')` — never hardcode display strings. English only
  (matches the backend); typing comes from `typeof en`, so a missing key is a
  compile error. Demo keys live under the `auction` namespace so `init-project`
  can prune them.
- Strict TypeScript is on (`strict`, `noUncheckedIndexedAccess`). Don't cast
  your way around it; model the type properly.
- Expected API failures surface as `ORPCError`s carrying the backend's Problem
  envelope in `error.data` (decoded by the link). For an endpoint's declared
  errors, narrow with `isDefinedError` and switch exhaustively on `error.code`
  (a `never` default), so a renamed code breaks the build; `problemTag` only for
  errors outside the contract. Never dispatch on human-readable text.

# Structure

- `src/app/` — shell: entries (SPA hydrate-or-render + SSR), router, layout,
  query client. `src/features/<name>/` — one folder per vertical slice (api
  hooks, pages, state); `auth` is a surviving feature, `auctions` the deletable
  demo. `src/api/` — oRPC client (OpenAPILink with a custom RFC 9457 Problem
  decoder) over an auth-aware fetch (bearer + 401-refresh), datetime boundary.
- New API calls: use the tanstack utils `orpc` from `src/api/orpc.ts`
  (`useQuery(orpc['<generated-key>'].get.queryOptions({ input }))`); plain
  one-shot calls go through `client` from the same module. Infer types from
  `ApiClient` (`Awaited<ReturnType<ApiClient['<key>']['get']>>`). Query keys
  derive from procedure path + input, so SSR prefetch (`makeOrpcUtils`) matches
  automatically (register prefetchers in `src/app/ssrPrefetch.ts`).
- Tests: Vitest + Testing Library + MSW. Register handlers per test with
  `server.use(...)`; type fixtures against contract-inferred types.
- Blocks bracketed by `// frontend:auction-block-start` / `-end` are demo
  wiring that `scripts/init-project.mjs` strips — keep the markers accurate.
- UI: this is **shadcn/ui** (base-nova style, built on Base UI), configured in
  `components.json`. Compose the primitives in `src/components/ui/` (`Button`,
  `Input`, `Field`, `Card`, `Badge`) — don't hand-write raw elements or Tailwind
  in feature code. Add more with `pnpm dlx shadcn@latest add <name>`; those files
  are vendored (edit freely, lint relaxes react-refresh/label rules there). Forms
  use the `Field` composition (`Field` + `FieldLabel htmlFor` + control + `FieldError`)
  and set `aria-invalid` on the control. Style with tokens (`bg-card`,
  `text-primary`, …), never hard-coded colors, so dark mode and the theme
  palette (`src/styles/tailwind.css`) apply for free.

# Modes

- `pnpm run dev` — SPA + Vite proxy (default). `pnpm run dev:ssr` — streaming SSR
  of the public pages. SSR renders only unauthenticated routes; the server
  never holds a user token. Keep components SSR-safe: no browser globals during
  render (only in effects/handlers), fetch through TanStack Query.
