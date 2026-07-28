# madrileno-frontend

The reference frontend for the [madrileno](../madrileno) backend template: a
React SPA (with SSR as a working opt-in) built against the backend's
**generated oRPC contract** (baklava's `orpc` output), so the Scala routes are
the single source of truth and drift is a compile error.

Stack: Vite + React 19 + TypeScript (strict) + TanStack Query + oRPC
(`@orpc/openapi-client` + `@orpc/tanstack-query`) + zod + react-router +
react-hook-form + Temporal.
Tests: Vitest + Testing Library + MSW, plus a Playwright e2e smoke. UI is
shadcn/ui (Tailwind v4) with a themeable token palette and dark mode, and
externalized UI strings (English) via use-intl, ready for i18n.

## The contract loop (the whole point)

```
Scala router specs ──sbt test──▶ target/baklava/orpc/src/*.ts
                                        │  pnpm run sync-contracts
                                        ▼
                              src/contracts/ (vendored, committed)
                                        │  typed clients + hooks
                                        ▼
                         pnpm run typecheck  ← fails on contract drift
```

Rename a field in a backend DTO, run `sbt test` + `pnpm run sync-contracts`,
and `pnpm run typecheck` fails at the exact frontend call site. The contract is
committed, so CI and fresh clones need no backend checkout.

## Quick start

You need Node 22+ (Node ≥20.19 works) and the backend running
([backend README](../madrileno)):

```bash
pnpm install
pnpm run dev          # SPA on http://localhost:5173, /v1 proxied to :9000
```

The Vite proxy makes API calls same-origin, so the backend needs **no CORS
config in dev**. Log in on `/login` (any email — the backend's dev auth), then
browse, bid, and watch the typed error envelope when a bid is too low.

Refreshing the contract after backend changes:

```bash
(cd ../madrileno && sbt test)   # regenerates target/baklava/orpc
pnpm run sync-contracts
pnpm run typecheck               # surfaces any drift as compile errors
```

## SPA by default, SSR when you want it

`pnpm run dev` / `pnpm run build` is a plain SPA — static files, any web server.
That's the default and the cheapest thing to operate.

The **SSR opt-in** (`server.js` + `src/app/entry-server.tsx`) server-renders
the _public_ pages — auction list and detail/bids — with TanStack Query
prefetch + dehydrate, streaming the HTML and hydrating on the client:

```bash
pnpm run dev:ssr                       # dev SSR (Vite middleware mode)
pnpm run build:ssr && pnpm run preview:ssr   # production SSR
curl -s localhost:5173 | grep card    # server-rendered auction HTML
```

Design notes:

- **Only unauthenticated routes render on the server.** Auth is a JWT in
  localStorage; the server never sees it, and doesn't need to — logged-in
  actions (bidding) are client-side interactions anyway. If you need
  authenticated SSR, switch to cookie-based sessions first.
- Components are **SSR-safe by construction**: no browser globals during
  render, data via TanStack Query, tokens behind an environment guard. Keep
  new code that way (CI builds the SSR bundle so regressions surface) and the
  SPA→SSR switch stays an afternoon of plumbing, not a rewrite.
- The SSR server (Express, `/healthz`, `Dockerfile`) is a second deployable.
  `API_BASE_URL` tells it where the backend is for server-side prefetch.

## Production

- **SPA**: `pnpm run build`, serve `dist/`. Set `VITE_API_BASE_URL` to the API
  origin at build time and add that frontend origin to the backend's
  `CORS_ALLOWED_ORIGINS`.
- **SSR**: `docker build .` (multi-stage, healthcheck on `/healthz`), run with
  `PORT` and `API_BASE_URL`. The production server forwards `/v1` to
  `API_BASE_URL` (same-origin for browsers, mirroring the dev proxy), so no
  CORS and no `VITE_API_BASE_URL` are needed unless you deliberately serve
  the API from a different origin.

## PWA (installable + offline shell)

The app is an installable PWA via `vite-plugin-pwa` (Workbox). `pnpm run build`
and `build:ssr` emit `sw.js` + `manifest.webmanifest` into the client output;
the SSR bundle skips the service worker (it's a client artifact).

- **Install**: a web manifest (`vite.config.ts` → `VitePWA.manifest`),
  `display: standalone`, `theme-color`. Its `name`/`short_name` derive from
  `package.json`, so `init-project` renaming the package re-brands the installed
  app too — no separate manifest edit.
- **Icons**: `@vite-pwa/assets-generator` rasterizes `public/pwa-icon.svg` into
  the full PNG set at build time (`pwa-*.png`, `maskable-icon-512x512.png`,
  `apple-touch-icon-180x180.png`, `favicon.ico`) and injects the head links —
  so iOS home-screen/splash works, not just Chromium/Android. Icons are build
  output (not committed); regenerate after editing the source SVG with
  `pnpm run generate-pwa-assets`. (Needs `sharp`, allowed via
  `pnpm.onlyBuiltDependencies`.)
- **Offline**: Workbox precaches the built app shell (JS/CSS/HTML/fonts/icons)
  and falls back to `/index.html` for navigations, so an installed app opens
  offline and renders client-side from cache. **API responses are not cached**
  (`/v1` and `/healthz` are denylisted) — offline data is a deliberate follow-up.
- **Updates**: `registerType: 'prompt'` — a new build never activates behind the
  user's back. `src/app/registerPwa.ts` surfaces it as a sonner toast with a
  **Reload** action. The worker is registered from bundled app code, not an
  injected inline script, so the production nonce CSP needs no script exception
  (it only adds `worker-src`/`manifest-src 'self'`).
- **Dev**: the service worker stays off in `pnpm run dev` / `dev:ssr` — no
  stale-cache surprises against HMR; it ships only in a production build.

One follow-up if you go further: a **runtime-caching strategy** for the API if
you want true offline _data_ (TanStack Query already caches in memory; choosing
per-route Workbox strategies is the next step).

## Internationalization (i18n-ready, English-only)

UI text goes through [use-intl](https://next-intl.dev/docs/environments/core-library)
— a typed message dictionary, no codegen. It **ships English only, to match the
backend** (emails and other backend content are English); the machinery for
_selecting_ a language is deliberately absent — see the note below.

- **Messages** are plain JSON in `src/i18n/messages/en.json`, grouped by namespace.
  Render them with `useTranslations('namespace')` → `t('key', { param })`. Types come
  from `typeof en` (`src/i18n/use-intl.d.ts`), so a missing or misnamed key is a
  **compile error**. Externalizing strings now keeps the eventual jump to multiple
  languages mechanical.
- **One provider, one locale**: `LocaleProvider` wraps the app with use-intl's
  `IntlProvider` fixed to `en`. No language switcher, no cookie, no `Accept-Language`
  negotiation — with one language there's nothing to negotiate — and `<html lang="en">`
  is static. `init-project` prunes the demo's `auction` namespace.

### Adding languages later

When you do, **source the locale from the backend, not a browser cookie.** The
moment the backend emits localized content (emails, notifications), the user's
language becomes a user-record attribute the backend owns — so the frontend should
read it from the auth/user payload and change it through an API call, with
`Accept-Language` as a pre-login default at most. A frontend-only cookie would be
split-brain (e.g. a Spanish UI but English emails). That's why the cookie /
negotiation / switcher machinery is intentionally left out until the backend
supports a per-user language.

## Observability (opt-in)

OpenObserve RUM pairs with the backend's OpenObserve instance: set the
`VITE_OPENOBSERVE_RUM_*` variables (see `.env.sample`; client token from
OpenObserve → Ingestion) and sessions, replays, and browser errors land next
to the backend traces. Unset = the SDK never loads (it's a lazy chunk).

## Security

Deliberate tradeoffs — accept or change them before shipping:

- **Tokens in `localStorage`** (`src/features/auth/tokenStore.ts`): XSS-exposed
  by design, in exchange for being SSR-safe, CSRF-immune, and simple. Acceptable
  for low-to-moderate risk (the CSP below hardens XSS). For sensitive data, move
  to httpOnly/Secure/SameSite cookies (the `/v1` forwarder already passes
  `Set-Cookie` through) and add CSRF protection.
- **Content Security Policy** (production SSR): `script-src 'self' 'nonce-…'` — no
  `unsafe-inline` for scripts; the two inline scripts (pre-paint theme setter,
  dehydrated state) are authorized by a per-request nonce. Plus `object-src
'none'`, `frame-ancestors 'none'`, `form-action 'self'`, and `worker-src`/
  `manifest-src 'self'` for the installable PWA. Dev has no CSP (Vite
  HMR needs inline/eval); a static SPA deploy must set CSP at the CDN with the
  theme script's hash; enabling RUM needs its host in `connect-src`.
- **Other posture**: the dev login (`/v1/auth/dev`) is backend-gated by
  `DEV_AUTH_ENABLED` (keep it off in production); the SSR server sends
  `nosniff` + `Referrer-Policy`, strips hop-by-hop headers on the `/v1` forward,
  and never leaks stack traces to visitors.
- **Reporting**: disclose vulnerabilities privately to the maintainer.

## Conventions

- **Types from the contract**: `Awaited<ReturnType<ApiClient['<key>']['get']>>`
  — never hand-written DTOs. `JsonifiedClient` keeps them wire-true
  (timestamps are ISO strings, matching what actually crosses HTTP).
- **Errors are declared and typed end to end**: the generated contracts declare
  errors under the backend's stable Problem `type` codes (extracted from the
  captured examples), the link's `customErrorResponseBodyDecoder` lifts RFC
  9457 responses into defined `ORPCError`s under the same codes, and
  `isDefinedError` narrows to the declared union. UI dispatches on the code,
  never on display text.
- **Temporal, not Date**: ESLint bans the `Date` global everywhere except
  `src/api/datetime.ts`, the wire boundary that converts ISO strings to
  `Temporal`.
- **Feature folders**: `src/features/<name>/` holds vertical slices (api hooks,
  pages, state) — `auth` is one, `auctions` is the deletable demo. The shell
  (`src/app/`, `src/api/`, `src/observability/`) stays feature-free; `init-project`
  strips only the `auctions` feature, so `auth` survives.
- **MSW handlers are typed against the contract** — the frontend's echo of the
  backend's router specs.

## Starting a real project

```bash
node scripts/init-project.mjs my-project
```

Deletes the auction demo (`src/features/auctions/` + every
`frontend:auction-block-*` marker block), leaving a runnable shell: login,
typed client, routing, tests, SSR opt-in. After running the backend's own
`init-project.scala`, regenerate + resync the contract.

## Scripts

| Script                                   | What                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `dev` / `build` / `preview`              | SPA (default)                                                                                 |
| `dev:ssr` / `build:ssr` / `preview:ssr`  | SSR opt-in                                                                                    |
| `typecheck` / `lint` / `format` / `test` | the gate (all run in CI)                                                                      |
| `e2e` / `e2e:prod`                       | Playwright smoke vs the dev / built production SSR server (needs the live backend; not in CI) |
| `smoke:docker`                           | build + run the SSR image, verify healthz, SSR HTML and the container healthcheck             |
| `sync-contracts`                         | vendor the backend-generated contract                                                         |
| `generate-pwa-assets`                    | rasterize `public/pwa-icon.svg` into the PWA icon PNGs (also runs in `build`)                 |
| `init-project`                           | strip the demo for a fresh project                                                            |

## License

The template is licensed under [Apache-2.0](LICENSE), but projects generated from it are unencumbered: you may relicense the code created via `scripts/init-project.mjs` under any terms, with no attribution required. The init script removes the LICENSE file (and this section) so you can add a license of your own choosing.
