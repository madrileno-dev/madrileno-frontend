// Logging and shutdown for server.js, kept apart so they can be tested without a build.

const traceparent = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/

/**
 * One line per entry: `LEVEL message` by default, ECS JSON with `format: 'json'`.
 * @param {{ format?: string, write?: (line: string) => void }} [options]
 */
export function createLogger({
  format = 'text',
  write = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  /** @param {'info' | 'error'} level @param {string} message @param {Record<string, unknown>} fields @param {unknown} [error] */
  const entry = (level, message, fields, error) => {
    if (format === 'json') {
      const errorFields =
        error instanceof Error
          ? { 'error.message': error.message, 'error.stack_trace': error.stack }
          : {}
      write(
        JSON.stringify({
          '@timestamp': new Date().toISOString(),
          'log.level': level,
          message,
          ...fields,
          ...errorFields,
        }),
      )
    } else {
      write(
        `${level.toUpperCase()} ${message}${error instanceof Error ? `\n${String(error.stack)}` : ''}`,
      )
    }
  }
  return {
    /** @param {string} message @param {Record<string, unknown>} [fields] */
    info: (message, fields = {}) => entry('info', message, fields),
    /** @param {string} message @param {unknown} [error] @param {Record<string, unknown>} [fields] */
    error: (message, error, fields = {}) => entry('error', message, fields, error),
  }
}

/**
 * Express middleware logging each request when its response finishes or is cut off. The query string stays out of
 * the line, since it can carry tokens.
 * @param {ReturnType<typeof createLogger>} log
 */
export function requestLog(log) {
  return (req, res, next) => {
    const path = new URL(req.originalUrl, 'http://localhost').pathname
    if (path === '/healthz') return next()
    const started = process.hrtime.bigint()
    res.on('close', () => {
      const nanos = process.hrtime.bigint() - started
      const millis = Math.round(Number(nanos) / 1e5) / 10
      const traceId = traceparent.exec(req.get('traceparent') ?? '')?.[1]
      log.info(`${req.method} ${path} ${String(res.statusCode)} ${String(millis)} ms`, {
        'http.request.method': req.method,
        'url.path': path,
        'http.response.status_code': res.statusCode,
        'event.duration': Number(nanos),
        ...(res.writableFinished ? {} : { 'event.outcome': 'failure' }),
        ...(traceId ? { trace_id: traceId } : {}),
      })
    })
    next()
  }
}

/**
 * Returns the handler for SIGTERM / SIGINT: stop accepting connections, let requests in flight finish, and exit 0.
 * Connections still open after `timeoutMs` are closed and the process exits 1.
 * @param {import('node:http').Server} server
 * @param {{ log: ReturnType<typeof createLogger>, timeoutMs: number, exit?: (code: number) => void }} options
 */
export function gracefulShutdown(server, { log, timeoutMs, exit = (code) => process.exit(code) }) {
  let draining = false
  // A keep-alive connection outlives its response; close each one as it falls idle so close() can complete.
  server.prependListener('request', (_req, res) => {
    if (draining) res.setHeader('Connection', 'close')
    res.on('finish', () => {
      if (draining) setImmediate(() => server.closeIdleConnections())
    })
  })
  return (/** @type {string} */ signal) => {
    if (draining) return
    draining = true
    log.info(`${signal} received, finishing requests in flight (up to ${String(timeoutMs)} ms)`)
    let forced = false
    const deadline = setTimeout(() => {
      forced = true
      log.error(`Requests still open after ${String(timeoutMs)} ms, closing their connections`)
      server.closeAllConnections()
    }, timeoutMs)
    server.close(() => {
      clearTimeout(deadline)
      log.info('Server closed')
      exit(forced ? 1 : 0)
    })
    server.closeIdleConnections()
  }
}
