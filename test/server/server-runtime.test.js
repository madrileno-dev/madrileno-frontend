import assert from 'node:assert/strict'
import { once } from 'node:events'
import net from 'node:net'
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

describe('createLogger', () => {
  it("keeps an error's cause, where fetch puts the reason it failed", () => {
    const failed = new TypeError('fetch failed', {
      cause: new Error('connect ECONNREFUSED 127.0.0.1:9000'),
    })
    const out = collect()
    createLogger({ write: out.write }).error('API forward failed', failed)

    assert.match(out.lines[0], /^ERROR API forward failed\n[\s\S]*ECONNREFUSED/)
  })
})

describe('requestLog', () => {
  it('writes one line per request with method, path without the query, status and duration', async () => {
    const out = collect()
    const app = express()
    app.use(requestLog(createLogger({ write: out.write })))
    app.get('/auctions', (_req, res) => res.status(201).send('ok'))
    const { url } = await listen(app)

    await fetch(`${url}/auctions?q=secret`)
    await eventually(() => assert.equal(out.lines.length, 1))

    assert.match(out.lines[0], /^INFO GET \/auctions 201 \d+(\.\d+)? ms$/)
  })

  it('says when a request was cut off before its response', async () => {
    const out = collect()
    const entered = signal()
    const app = express()
    app.use(requestLog(createLogger({ write: out.write })))
    app.get('/slow', () => entered.resolve())
    const { url } = await listen(app)

    const aborted = new AbortController()
    const request = fetch(`${url}/slow`, { signal: aborted.signal }).catch(() => {})
    await entered.promise
    aborted.abort()
    await request
    await eventually(() => assert.equal(out.lines.length, 1))

    assert.match(
      out.lines[0],
      /^INFO GET \/slow 200 \d+(\.\d+)? ms, cut off before the response finished$/,
    )
  })

  it('leaves /healthz out', async () => {
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

  it('answers a request that arrives on an open connection during the drain, with Connection: close', async () => {
    const app = express()
    app.get('/ping', (_req, res) => res.send('pong'))
    const { server } = await listen(app)
    const exits = []
    const drain = gracefulShutdown(server, {
      log: createLogger({ write: () => {} }),
      timeoutMs: 5000,
      exit: (code) => exits.push(code),
    })

    const socket = net.connect(server.address().port)
    await once(socket, 'connect')
    socket.write('GET /ping HTTP/1.1\r\nHost: localhost\r\n')
    await new Promise((r) => setTimeout(r, 50))
    drain('SIGTERM')
    socket.write('\r\n')
    let response = ''
    socket.on('data', (chunk) => (response += String(chunk)))
    await once(socket, 'close')

    assert.match(response, /^HTTP\/1\.1 200/)
    assert.match(response, /connection: close/i)
    assert.match(response, /pong$/)
    await eventually(() => assert.deepEqual(exits, [0]))
  })

  it('closes connections still open after the timeout, logs them as cut off, then exits 1', async () => {
    const out = collect()
    const log = createLogger({ write: out.write })
    const entered = signal()
    const app = express()
    app.use(requestLog(log))
    app.get('/hang', () => entered.resolve())
    const { server, url } = await listen(app)
    const exits = []
    const drain = gracefulShutdown(server, {
      log,
      timeoutMs: 200,
      exit: (code) =>
        exits.push({ code, cutOff: out.lines.filter((line) => line.includes('GET /hang')) }),
    })

    const hanging = fetch(`${url}/hang`).catch((e) => e)
    await entered.promise
    drain('SIGTERM')

    assert.ok((await hanging) instanceof Error)
    await eventually(() => assert.equal(exits.length, 1))
    assert.equal(exits[0].code, 1)
    assert.match(exits[0].cutOff.join('\n'), /cut off before the response finished/)
  })
})
