#!/usr/bin/env node
// Build the SSR image and verify the container: /healthz, SSR HTML, HEALTHCHECK, request logs
// and a clean exit on SIGTERM.
// Backend-independent: SSR renders the shell even when the API is unreachable
// (prefetch failures are swallowed), so this checks the container / SSR / hydration
// wiring without a running backend. Usage: pnpm run smoke:docker
import { execSync, spawnSync } from 'node:child_process'

const IMAGE = 'madrileno-frontend:smoke'
const NAME = 'fe-docker-smoke'
const PORT = 5179

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const out = (cmd) => execSync(cmd, { encoding: 'utf-8' }).trim()

const fail = (msg) => {
  console.error(`\nFAIL: ${msg}`)
  spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
  process.exit(1)
}

console.log('== build image ==')
sh(`docker build -t ${IMAGE} .`)

spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
console.log('== run container ==')
sh(
  `docker run -d --name ${NAME} --network=host -e PORT=${String(PORT)} -e API_BASE_URL=http://localhost:9000 ${IMAGE}`,
)

const started = Date.now()
let healthz = false
while (Date.now() - started < 30_000) {
  try {
    const res = await fetch(`http://localhost:${String(PORT)}/healthz`)
    if (res.ok) {
      healthz = true
      break
    }
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 1000))
}
if (!healthz) fail('/healthz never answered')
console.log('healthz OK')

const html = await (await fetch(`http://localhost:${String(PORT)}/`)).text()
if (!/<h1[\s>]/.test(html)) fail('SSR HTML missing rendered content')
if (!html.includes('__RQ_STATE__')) fail('SSR HTML missing dehydrated cache script')
console.log('SSR HTML OK (rendered content + hydration state)')

let containerHealth = 'starting'
while (Date.now() - started < 90_000) {
  containerHealth = out(`docker inspect --format '{{.State.Health.Status}}' ${NAME}`)
  if (containerHealth === 'healthy' || containerHealth === 'unhealthy') break
  await new Promise((r) => setTimeout(r, 3000))
}
if (containerHealth !== 'healthy') fail(`container HEALTHCHECK is '${containerHealth}'`)
console.log('container HEALTHCHECK healthy')

const logs = out(`docker logs ${NAME}`)
if (!logs.split('\n').some((line) => /^INFO GET \/ 200 /.test(line)))
  fail('no request log line for GET /')
console.log('request log OK')

const stopStarted = Date.now()
sh(`docker stop --time 20 ${NAME}`, { stdio: 'ignore' })
const stopSeconds = (Date.now() - stopStarted) / 1000
const exitCode = out(`docker inspect --format '{{.State.ExitCode}}' ${NAME}`)
if (exitCode !== '0') fail(`container exited ${exitCode} on SIGTERM instead of 0`)
if (stopSeconds > 5) fail(`SIGTERM took ${stopSeconds.toFixed(1)}s to stop the container`)
console.log(`SIGTERM: exited 0 in ${stopSeconds.toFixed(1)}s`)

sh(`docker rm -f ${NAME}`, { stdio: 'ignore' })
console.log('\nDocker smoke: PASS')
