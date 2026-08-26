#!/usr/bin/env node
/**
 * Local dev server for the web/ teaching frontend.
 *
 *   node scripts/web-server.mjs          # http://127.0.0.1:8080
 *   PORT=8123 node scripts/web-server.mjs
 *
 * Two jobs:
 *   1. Static file service for web/ (same as `python3 -m http.server`).
 *   2. SSE endpoint /api/run that spawns `node run.mjs <level> --trace`
 *      and streams the real event flow back to the browser.
 *
 * The API key never leaves this process: the browser only learns whether
 * QA_API_KEY + QA_BASE_URL are set, via /api/config.
 *
 * Only Node built-ins are used — no new dependencies.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB_DIR = join(ROOT, 'web')
const PORT = parseInt(process.env.PORT || '8080', 10)
const RUN_TIMEOUT_MS = 120_000

const hasKey = Boolean(process.env.QA_API_KEY) && Boolean(process.env.QA_BASE_URL)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

// At most one run at a time: the teaching flow is sequential, and a
// second agent would compete for the same terminal output anyway.
let activeRun = null

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function serveStatic(pathname, req, res) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname)
  const file = join(WEB_DIR, rel)
  if (file !== WEB_DIR && !file.startsWith(WEB_DIR + sep)) {
    return json(res, 403, { error: 'forbidden' })
  }
  try {
    // no-cache + ETag: the browser revalidates every load and gets a cheap
    // 304 when nothing changed, so edits show up on a plain refresh.
    const info = await stat(file)
    const etag = `"${info.size}-${Math.floor(info.mtimeMs)}"`
    const headers = {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      etag,
    }
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers)
      return res.end()
    }
    const body = await readFile(file)
    res.writeHead(200, headers)
    res.end(body)
  } catch {
    json(res, 404, { error: 'not-found' })
  }
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function handleRun(url, req, res) {  if (!hasKey) return json(res, 400, { error: 'no-key' })

  const levelRaw = url.searchParams.get('level')
  const level = Number(levelRaw)
  if (!/^\d{1,2}$/.test(levelRaw ?? '') || level < 0 || level > 11) {
    return json(res, 400, { error: 'bad-level' })
  }

  const question = url.searchParams.get('question')?.trim()
  if (!question) return json(res, 400, { error: 'bad-question' })

  const model = url.searchParams.get('model')?.trim() || ''

  if (activeRun) return json(res, 409, { error: 'busy' })

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  res.flushHeaders()

  const child = spawn('node', [join(ROOT, 'run.mjs'), String(level), '--trace', question], {
    env: {
      ...process.env,
      QA_TRACE: '1',
      QA_QUESTION: question,
      QA_MODEL: model,
    },
  })

  const answerLines = []
  let outBuf = ''
  let errBuf = ''
  let closed = false

  const finish = () => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    activeRun = null
  }

  const timer = setTimeout(() => {
    sse(res, 'error', { reason: 'timeout', message: `运行超过 ${RUN_TIMEOUT_MS / 1000} 秒，已停止。` })
    res.end()
    child.kill('SIGKILL')
    finish()
  }, RUN_TIMEOUT_MS)

  activeRun = { child, timer }

  // If the browser disconnects (Stop button / level switch), kill the child.
  // Listen on res, not req: for a GET, the request's 'close' fires as soon
  // as the request is received, which would kill the child immediately.
  res.on('close', () => {
    if (closed) return
    child.kill('SIGKILL')
    finish()
  })

  const onOutLine = (line) => {
    const trace = line.match(/^\s*\[trace\] (.+)$/)
    if (trace) return sse(res, 'trace', { type: trace[1] })
    const session = line.match(/── session: (.+) ──/)
    if (session) return sse(res, 'session', { id: session[1] })
    if (line.trim() !== '') answerLines.push(line)
  }

  const onErrLine = (line) => {
    if (line.trim() === '') return
    if (line.includes('ExperimentalWarning') || line.includes('--trace-warnings')) return
    sse(res, 'log', { line })
  }

  child.stdout.on('data', (d) => {
    outBuf += d
    const lines = outBuf.split('\n')
    outBuf = lines.pop()
    lines.forEach(onOutLine)
  })

  child.stderr.on('data', (d) => {
    errBuf += d
    const lines = errBuf.split('\n')
    errBuf = lines.pop()
    lines.forEach(onErrLine)
  })

  child.on('error', (err) => {
    sse(res, 'error', { reason: 'spawn', message: String(err) })
    res.end()
    finish()
  })

  child.on('close', (code) => {
    if (outBuf.trim() !== '') onOutLine(outBuf)
    if (errBuf.trim() !== '') onErrLine(errBuf)
    sse(res, 'done', { answer: answerLines.join('\n').trim(), code })
    res.end()
    finish()
  })
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (req.method === 'GET' && url.pathname === '/api/config') {
    return json(res, 200, { hasKey })
  }
  if (req.method === 'GET' && url.pathname === '/api/run') {
    return handleRun(url, req, res)
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(url.pathname, req, res)
  }
  json(res, 405, { error: 'method-not-allowed' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`web server → http://127.0.0.1:${PORT}`)
  console.log(`QA_API_KEY: ${process.env.QA_API_KEY ? '检测到' : '未配置'} · QA_BASE_URL: ${process.env.QA_BASE_URL ? '检测到' : '未配置'}（实时运行${hasKey ? '可用' : '不可用'}）`)
})
