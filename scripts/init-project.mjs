#!/usr/bin/env node
// Remove the wine-auction demo and leave a runnable shell (login + placeholder home).
// Usage: node scripts/init-project.mjs [name]
import fs from 'node:fs'
import path from 'node:path'

const name = process.argv[2]

const auctionsDir = path.join('src', 'features', 'auctions')
const deletedDemo = fs.existsSync(auctionsDir)
if (deletedDemo) fs.rmSync(auctionsDir, { recursive: true })
const auctionsTestDir = path.join('test', 'features', 'auctions')
if (fs.existsSync(auctionsTestDir)) fs.rmSync(auctionsTestDir, { recursive: true })
const auctionsE2e = path.join('e2e', 'auctions.spec.ts')
if (fs.existsSync(auctionsE2e)) fs.rmSync(auctionsE2e)

const licenseDeleted = fs.existsSync('LICENSE')
if (licenseDeleted) fs.rmSync('LICENSE')
if (fs.existsSync('README.md')) {
  const readme = fs.readFileSync('README.md', 'utf-8')
  const strippedReadme = readme.replace(/\n?^## License[ \t]*\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m, '')
  if (strippedReadme !== readme) fs.writeFileSync('README.md', strippedReadme)
}

const blockRe = /^.*frontend:auction-block-start[\s\S]*?frontend:auction-block-end.*(?:\n|$)/gm
const leftoverImportRe = /^import .* from '.*features\/auctions.*'\r?\n/gm

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'contracts' || entry.name === 'node_modules') continue
      yield* walk(p)
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      yield p
    }
  }
}

let stripped = 0
for (const file of walk('src')) {
  const original = fs.readFileSync(file, 'utf-8')
  const transformed = original.replace(blockRe, '').replace(leftoverImportRe, '')
  if (transformed !== original) {
    fs.writeFileSync(file, transformed)
    stripped += 1
  }
}

let prunedLocales = 0
const messagesDir = path.join('src', 'i18n', 'messages')
if (fs.existsSync(messagesDir)) {
  for (const file of fs.readdirSync(messagesDir).filter((f) => f.endsWith('.json'))) {
    const catalogPath = path.join(messagesDir, file)
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'))
    if ('auction' in catalog) {
      delete catalog.auction
      fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
      prunedLocales += 1
    }
  }
}

const routerPath = path.join('src', 'app', 'router.tsx')
const router = fs.readFileSync(routerPath, 'utf-8')
const anchorRe = /^.*frontend:home-anchor.*(?:\n|$)/m
if (anchorRe.test(router)) {
  fs.writeFileSync(
    routerPath,
    router
      .replace(anchorRe, "  { path: '/', element: <Home /> },\n")
      .replace(/^import { NotFound } from '\.\/NotFound'$/m, (line) =>
        [line, "import { Home } from './Home'"].join('\n'),
      ),
  )
}

if (name) {
  const pkgPath = 'package.json'
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  pkg.name = `${name}-frontend`
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  const htmlPath = 'index.html'
  const html = fs.readFileSync(htmlPath, 'utf-8')
  fs.writeFileSync(htmlPath, html.replace(/<title>.*<\/title>/, `<title>${name}</title>`))
}

console.log(`Deleted demo feature: ${deletedDemo ? auctionsDir : '(already gone)'}`)
if (licenseDeleted)
  console.log(
    'Deleted LICENSE (the template’s Apache-2.0 — generated projects may relicense freely)',
  )
console.log(`Stripped auction blocks from ${stripped} file(s)`)
console.log(`Pruned the auction namespace from ${prunedLocales} locale catalog(s)`)
if (name) console.log(`Renamed package to ${name}-frontend`)
console.log()
console.log('Next:')
console.log('  pnpm run typecheck && pnpm run lint && pnpm run test   # should all be green')
if (licenseDeleted)
  console.log(
    '  pick a LICENSE for your project        # the template’s Apache-2.0 file was removed',
  )
console.log('  (after backend init-project + sbt test): pnpm run sync-contracts')
