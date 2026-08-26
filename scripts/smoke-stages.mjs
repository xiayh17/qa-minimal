#!/usr/bin/env node
/**
 * Headless smoke test for every stage: boots each stages/<NN-*>/cordis.yml
 * through run.mjs with a dummy API key and an unreachable base URL, then
 * scans the output for plugin-load failures.
 *
 *   node scripts/smoke-stages.mjs [stage ...]
 *
 * Expected behavior per stage: all plugins load, the driver starts a turn,
 * the LLM request fails against the dummy endpoint, and the process exits
 * on its own. A hanging process is killed after the timeout and reported.
 *
 * Exit code is non-zero when any stage shows a load error or times out.
 * Run this after every dsh version bump.
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TIMEOUT_MS = 60_000

// Patterns that mean a plugin failed to load or a composition broke.
// An unreachable-endpoint request failure is NOT matched here on purpose:
// with dummy credentials that is the expected end state, not an error.
const LOAD_ERROR = [
  'ERR_MODULE_NOT_FOUND',
  'ERR_IMPORT_ATTRIBUTE_MISSING',
  'missing service',
  'invalid plugin',
  'ValidationError',
  'has been registered',
  'TypeError',
  'is not a function',
]

const argStages = process.argv.slice(2)
const dirs = readdirSync(join(root, 'stages'))
  .filter((d) => /^\d{2}-/.test(d))
  .sort()
  .filter((d) => argStages.length === 0 || argStages.includes(String(parseInt(d))))

function smokeStage(dir) {
  const stage = String(parseInt(dir))
  return new Promise((resolve) => {
    const child = spawn('node', [join(root, 'run.mjs'), stage, '--trace', 'smoke test'], {
      env: {
        ...process.env,
        QA_API_KEY: 'dummy',
        QA_BASE_URL: 'http://127.0.0.1:9',
      },
    })
    let out = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, TIMEOUT_MS)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('close', (code) => {
      clearTimeout(timer)
      const clean = out.split('\n').filter((l) => !l.includes('ExperimentalWarning'))
      const hits = LOAD_ERROR.filter((p) => clean.some((l) => l.includes(p)))
      const sample = hits.length
        ? clean.find((l) => l.includes(hits[0]))?.trim().slice(0, 160)
        : ''
      resolve({ stage, dir, timedOut, code, hits, sample })
    })
  })
}

let failed = 0
for (const dir of dirs) {
  const r = await smokeStage(dir)
  const ok = !r.timedOut && r.hits.length === 0
  if (!ok) failed++
  const status = ok ? 'ok  ' : 'FAIL'
  const why = r.timedOut ? `timeout after ${TIMEOUT_MS / 1000}s`
    : r.hits.length ? `${r.hits.join(', ')} — ${r.sample}`
    : `exit ${r.code}`
  console.log(`${status} stage ${r.stage} (${r.dir}) — ${why}`)
}

console.log(failed ? `\n${failed} stage(s) failed` : '\nall stages passed')
process.exit(failed ? 1 : 0)
