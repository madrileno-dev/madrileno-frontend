// Logging and shutdown for server.js, kept apart so they can be tested without a build.

import { inspect } from 'node:util'

/**
 * One `LEVEL message` line per entry, followed by the error and its cause when there is one.
 * @param {{ write?: (line: string) => void }} [options]
 */
export function createLogger({ write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  /** @param {'info' | 'error'} level @param {string} message @param {unknown} [error] */
  const entry = (level, message, error) =>
    write(`${level.toUpperCase()} ${message}${error instanceof Error ? `\n${inspect(error)}` : ''}`)
  return {
    /** @param {string} message */
    info: (message) => entry('info', message),
    /** @param {string} message @param {unknown} [error] */
    error: (message, error) => entry('error', message, error),
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
      const cutOff = res.writableFinished ? '' : ', cut off before the response finished'
      log.info(`${req.method} ${path} ${String(res.statusCode)} ${String(millis)} ms${cutOff}`)
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
      if (forced) setTimeout(() => exit(1), 100)
      else exit(0)
    })
    server.closeIdleConnections()
  }
}
