---
role: frontend
summary: React web app (Vite, TanStack Query, oRPC client); dev server on port 5173, /v1 proxied to the backend on 9000
---

- start: `(cd {dir} && pnpm run dev)`; it runs until stopped, so start it in the
  background and stop it when you are done
- consumes the API contract: `(cd {dir} && pnpm run sync-contracts ../{backend}/target/baklava/views/client/orpc/src)`,
  then `pnpm run typecheck`
- rules: `{dir}/AGENTS.md`
