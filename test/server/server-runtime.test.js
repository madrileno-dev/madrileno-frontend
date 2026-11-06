import assert from 'node:assert/strict'
import { once } from 'node:events'
import { afterEach, describe, it } from 'node:test'
import express from 'express'
import { createLogger, gracefulShutdown, requestLog } from '../../server-runtime.js'

const servers = []

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close()
    server.closeAllConnections()
  }
})

async function listen(app) {
  const server = app.listen(0)
  servers.push(server)
  await once(server, 'listening')
  return { server, url: `http://localhost:${String(server.address().port)}` }
}

function collect() {
  const lines = []
  return { lines, write: (line) => lines.push(line) }
}

function signal() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

async function eventually(check, timeoutMs = 2000) {
  const started = performance.now()
  for (;;) {
    try {
      return check()
    } catch (e) {
      if (performance.now() - started > timeoutMs) throw e
      await new Promise((r) => setTimeout(r, 20))
    }
  }
}

describe('requestLog', () => {
  it('writes one JSON line per request with method, path, status, duration and trace id', async () => {
    const out = collect()
    const app = express()
    app.use(requestLog(createLogger({ format: 'json', write: out.write })))
    app.get('/auctions', (_req, res) => res.status(201).send('ok'))
    const { url } = await listen(app)

    await fetch(`${url}/auctions?q=secret`, {
      headers: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
    })
    await eventually(() => assert.equal(out.lines.length, 1))

    const entry = JSON.parse(out.lines[0])
    assert.equal(entry['log.level'], 'info')
    assert.equal(entry['http.request.method'], 'GET')
    assert.equal(entry['url.path'], '/auctions')
    assert.equal(entry['http.response.status_code'], 201)
    assert.equal(entry.trace_id, '4bf92f3577b34da6a3ce929d0e0e4736')
    assert.equal(typeof entry['event.duration'], 'number')
    assert.ok(!out.lines[0].includes('secret'))
  })

  it('writes a plain line by default and leaves /healthz out', async () => {
    const out = collect()
    const app = express()
    app.use(requestLog(createLogger({ write: out.write })))
    app.get('/healthz', (_req, res) => res.send('ok'))
    app.get('/', (_req, res) => res.send('ok'))
    const { url } = await listen(app)

    await fetch(`${url}/healthz`)
    await fetch(`${url}/`)
    await eventually(() => assert.equal(out.lines.length, 1))

    assert.match(out.lines[0], /^INFO GET \/ 200 \d+(\.\d+)? ms$/)
  })
})

describe('gracefulShutdown', () => {
  it('lets a request in flight finish, refuses new connections, then exits 0', async () => {
    const out = collect()
    const entered = signal()
    const app = express()
    app.get('/slow', (_req, res) => entered.resolve(() => res.send('done')))
    const { server, url } = await listen(app)
    const exits = []
    const drain = gracefulShutdown(server, {
      log: createLogger({ write: out.write }),
      timeoutMs: 5000,
      exit: (code) => exits.push(code),
    })

    const inFlight = fetch(`${url}/slow`)
    const release = await entered.promise
    drain('SIGTERM')

    await assert.rejects(fetch(`${url}/slow`, { signal: AbortSignal.timeout(1000) }))
    release()
    assert.equal(await (await inFlight).text(), 'done')
    await eventually(() => assert.deepEqual(exits, [0]))
    assert.match(out.lines[0], /SIGTERM/)
  })

  it('closes connections still open after the timeout and exits 1', async () => {
    const entered = signal()
    const app = express()
    app.get('/hang', () => entered.resolve())
    const { server, url } = await listen(app)
    const exits = []
    const drain = gracefulShutdown(server, {
      log: createLogger({ write: () => {} }),
      timeoutMs: 200,
      exit: (code) => exits.push(code),
    })

    const hanging = fetch(`${url}/hang`).catch((e) => e)
    await entered.promise
    drain('SIGTERM')

    assert.ok((await hanging) instanceof Error)
    await eventually(() => assert.deepEqual(exits, [1]))
  })
})
