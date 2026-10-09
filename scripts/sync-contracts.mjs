#!/usr/bin/env node
// Vendor the backend-generated oRPC contract into src/contracts/.
// Usage: node scripts/sync-contracts.mjs [source-dir]  (or CONTRACTS_SRC=<dir>)
import fs from 'node:fs'
import path from 'node:path'

const source =
  process.argv[2] ??
  process.env.CONTRACTS_SRC ??
  path.join('..', 'madrileno', 'target', 'baklava', 'views', 'client', 'orpc', 'src')
const dest = path.join('src', 'contracts')

if (!fs.existsSync(path.join(source, 'contracts.ts'))) {
  console.error(`No generated contract found at '${source}' (missing contracts.ts).`)
  console.error('Generate it first: run `sbt test` in the backend repo, then re-run this script.')
  console.error(
    'Different backend location? node scripts/sync-contracts.mjs <path-to>/target/baklava/views/client/orpc/src',
  )
  process.exit(1)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.mkdirSync(dest, { recursive: true })
const files = fs.readdirSync(source, { recursive: true }).filter((f) => f.endsWith('.ts'))
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true })
  fs.copyFileSync(path.join(source, f), path.join(dest, f))
}
fs.writeFileSync(
  path.join(dest, 'GENERATED.md'),
  '# Generated — do not edit\n\nVendored from the backend oRPC contract' +
    ' (`target/baklava/views/client/orpc/src`, the client view without the admin routes, produced by `sbt testFull`).\n' +
    'Refresh with `pnpm run sync-contracts`.\n',
)
console.log(`Synced ${files.length} contract file(s): ${source} -> ${dest}`)
