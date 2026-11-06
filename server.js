import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import { Transform } from 'node:stream'
import express from 'express'
import { createLogger, gracefulShutdown, requestLog } from './server-runtime.js'

const isProduction = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT ?? 5173)
const shutdownTimeoutSetting = process.env.SHUTDOWN_TIMEOUT_MS || '25000'
const shutdownTimeoutMs = Number(shutdownTimeoutSetting)
if (!/^\d+$/.test(shutdownTimeoutSetting) || shutdownTimeoutMs > 2147483647) {
  throw new Error(
    `SHUTDOWN_TIMEOUT_MS must be a whole number of milliseconds, got '${process.env.SHUTDOWN_TIMEOUT_MS}'`,
  )
}
const log = createLogger()

// CSP for production HTML: inline scripts run only via the per-request nonce (no 'unsafe-inline').
// If you enable OpenObserve RUM, add its host to `connect-src`.
function contentSecurityPolicy(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ')
}
// Server-side prefetch target; the browser keeps using VITE_API_BASE_URL.
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9000'
const ABORT_DELAY = 10000

const app = express()
app.disable('x-powered-by')

/** @type {import('vite').ViteDevServer | undefined} */
let vite
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  app.use(vite.middlewares)
  app.use(requestLog(log))
} else {
  app.use(requestLog(log))
  const compression = (await import('compression')).default
  const sirv = (await import('sirv')).default
  app.use(compression())
  app.use(sirv('./dist/client', { extensions: [] }))

  // Same-origin /v1 (Vite's proxy provides this in dev); without it the SSR
  // catch-all below answers API calls with rendered HTML.
  const { Readable } = await import('node:stream')
  app.use('/v1', async (req, res) => {
    try {
      const target = new URL(req.originalUrl, apiBaseUrl)
      const headers = { ...req.headers }
      delete headers.host
      delete headers.connection
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
        duplex: 'half',
        redirect: 'manual',
      })
      res.status(upstream.status)
      upstream.headers.forEach((value, key) => {
        // fetch already decompressed the body; hop-by-hop headers must not be
        // forwarded; Set-Cookie can repeat and setHeader would clobber it.
        if (
          !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(
            key,
          ) &&
          key !== 'set-cookie'
        ) {
          res.setHeader(key, value)
        }
      })
      for (const cookie of upstream.headers.getSetCookie()) {
        res.append('set-cookie', cookie)
      }
      if (upstream.body) Readable.fromWeb(upstream.body).pipe(res)
      else res.end()
    } catch (e) {
      log.error('API forward failed', e)
      res.status(502).json({ type: 'about:blank', status: 502, title: 'Upstream unavailable' })
    }
  })
}

const templateHtml = isProduction ? await fs.readFile('./dist/client/index.html', 'utf-8') : ''

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('*all', async (req, res) => {
  try {
    const url = req.originalUrl

    // Anything with a file extension that reached us missed the static
    // handlers above — 404 instead of SSR-rendering HTML for it.
    if (/\.\w+$/.test(new URL(url, 'http://localhost').pathname)) {
      res.status(404).end()
      return
    }

    /** @type {string} */
    let template
    /** @type {import('./src/app/entry-server.tsx').render} */
    let render
    if (!isProduction) {
      template = await fs.readFile('./index.html', 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/app/entry-server.tsx')).render
    } else {
      template = templateHtml
      render = (await import('./dist/server/entry-server.js')).render
    }

    const { pipe, abort, dehydratedState } = await render(url, apiBaseUrl, (error) =>
      log.error('SSR render error', error),
    )

    // Per-request nonce authorizes the inline scripts under the CSP (prod only — Vite HMR needs
    // inline/eval in dev).
    const nonce = isProduction ? randomBytes(16).toString('base64') : ''
    res.status(200)
    res.set({
      'Content-Type': 'text/html',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...(isProduction ? { 'Content-Security-Policy': contentSecurityPolicy(nonce) } : {}),
    })

    const nonced = (html) =>
      isProduction ? html.replaceAll('<script', `<script nonce="${nonce}"`) : html
    const [rawStart, rawEnd] = template.split('<!--app-html-->')
    const htmlStart = nonced(rawStart)
    const htmlEnd = nonced(rawEnd)
    // Escape `<` so state can't close the script tag and inject markup.
    const stateJson = JSON.stringify(dehydratedState).replace(/</g, '\\u003c')
    const stateScript = `<script${isProduction ? ` nonce="${nonce}"` : ''}>window.__RQ_STATE__=${stateJson}</script>`

    const transformStream = new Transform({
      transform(chunk, encoding, callback) {
        res.write(chunk, encoding)
        callback()
      },
    })
    const abortTimer = setTimeout(() => abort(), ABORT_DELAY)
    transformStream.on('finish', () => {
      clearTimeout(abortTimer)
      res.write(stateScript)
      res.end(htmlEnd)
    })
    // Client went away mid-stream: stop rendering for nobody.
    res.on('close', () => {
      clearTimeout(abortTimer)
      if (!res.writableEnded) abort()
    })

    res.write(htmlStart)
    pipe(transformStream)
  } catch (e) {
    if (e instanceof Error) vite?.ssrFixStacktrace(e)
    log.error('SSR render failed', e)
    res.status(500)
    // Stack traces reveal server internals — never send them to production visitors.
    if (isProduction) res.end('Internal Server Error')
    else res.end(e instanceof Error ? e.stack : String(e))
  }
})

const server = app.listen(port, () => {
  log.info(`SSR server started at http://localhost:${port} (api: ${apiBaseUrl})`)
})
const drain = gracefulShutdown(server, { log, timeoutMs: shutdownTimeoutMs })
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => drain(signal))
}
