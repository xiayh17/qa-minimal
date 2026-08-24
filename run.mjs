#!/usr/bin/env node
/**
 * Universal stage runner.
 *
 *   qa-minimal <stage> [--trace] [--resume <id>] [--model <id>] <question...>
 *   qa-minimal inspect <stage>
 *   qa-minimal diff <stage-a> <stage-b>
 *
 * Resolves stages/<NN-name>/cordis.yml, sets env vars the stage driver reads,
 * and boots it through the same 15-line cordis pattern as vendor/cordis/bin.js.
 *
 * Stages 3+ get a disposable temp workspace (see lib/workspace.mjs) so that
 * file writes and bash side effects never pollute the git-tracked fixture tree.
 */
import { Context } from '@deepseek-ai/cordis'
import { pathToFileURL } from 'node:url'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { setupWorkspace } from './lib/workspace.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STAGES_DIR = join(__dirname, 'stages')

// ── subcommands ──────────────────────────────────────────────────────

if (process.argv[2] === 'inspect') {
  const n = process.argv[3]
  if (n === undefined) { console.error('usage: qa-minimal inspect <stage>'); process.exit(1) }
  inspectStage(n)
  process.exit(0)
}

if (process.argv[2] === 'diff') {
  const a = process.argv[3], b = process.argv[4]
  if (a === undefined || b === undefined) { console.error('usage: qa-minimal diff <stage-a> <stage-b>'); process.exit(1) }
  diffStages(a, b)
  process.exit(0)
}

// ── normal stage runner ──────────────────────────────────────────────

const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.error('usage: qa-minimal <stage> [--trace] [--resume <id>] [--model <id>] <question...>')
  console.error('       qa-minimal inspect <stage>')
  console.error('       qa-minimal diff <stage-a> <stage-b>')
  console.error('stages: 0=llm-stream  1=agent-loop  2=persistence  3=fs-tools  4=shell  5=safety  6=approval')
  console.error('        7=stateful-tasks  8=multi-agent  9=workflow  10=operable  11=productized')
  process.exit(1)
}

const stageNum = argv[0]
const rest = argv.slice(1)

let trace = false
let resume = null
let model = null
const questionParts = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--trace') { trace = true; continue }
  if (rest[i] === '--resume') { resume = rest[++i]; continue }
  if (rest[i] === '--model') { model = rest[++i]; continue }
  questionParts.push(rest[i])
}

const prefix = String(stageNum).padStart(2, '0')
const stageDir = readdirSync(STAGES_DIR).find((d) => d.startsWith(prefix + '-'))
if (stageDir === undefined) {
  console.error(`stage ${stageNum} not found in ${STAGES_DIR}`)
  process.exit(1)
}
const stagePath = join(STAGES_DIR, stageDir)

// Stages 3+ get a disposable temp workspace so side effects are isolated.
if (parseInt(stageNum) >= 3) {
  const { workspace } = setupWorkspace()
  process.chdir(workspace)
}

process.env.QA_TRACE = trace ? '1' : ''
process.env.QA_RESUME = resume ?? ''
process.env.QA_MODEL = model ?? ''
process.env.QA_QUESTION = questionParts.join(' ')

const ctx = new Context()
ctx.baseUrl = pathToFileURL(stagePath + '/').href
await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@deepseek-ai/cordis-plugin-include',
  config: { path: './cordis.yml' },
})

// ── inspect / diff helpers ───────────────────────────────────────────

/** Extract ordered plugin names from a cordis.yml file. */
function extractPlugins(yamlPath) {
  const text = readFileSync(yamlPath, 'utf8')
  const plugins = []
  for (const line of text.split('\n')) {
    const m = line.match(/^- name:\s+(.+)$/)
    if (m) plugins.push(m[1].trim().replace(/['"]/g, ''))
  }
  return plugins
}

/** Find the stage directory for a given stage number. */
function findStageDir(n) {
  const p = String(n).padStart(2, '0')
  const d = readdirSync(STAGES_DIR).find((d) => d.startsWith(p + '-'))
  if (d === undefined) {
    console.error(`stage ${n} not found`)
    process.exit(1)
  }
  return { dir: d, path: join(STAGES_DIR, d) }
}

/** Read the stage title from the first comment line of cordis.yml. */
function stageTitle(stagePath) {
  const text = readFileSync(join(stagePath, 'cordis.yml'), 'utf8')
  const m = text.match(/^#\s+Stage\s+\d+\s+—\s+(.+)$/m)
  return m ? m[1] : '(untitled)'
}

function inspectStage(n) {
  const { dir, path } = findStageDir(n)
  const title = stageTitle(path)
  const plugins = extractPlugins(join(path, 'cordis.yml'))

  console.log(`Stage ${String(n).padStart(2, '0')} — ${title}`)
  console.log()
  console.log(`Mounted plugins: ${plugins.length}`)
  plugins.forEach((p) => {
    const label = p.startsWith('@deepseek-ai/') ? p.replace('@deepseek-ai/', '') : p
    console.log(`  ${label}`)
  })
}

function diffStages(a, b) {
  const sa = findStageDir(a)
  const sb = findStageDir(b)
  const pa = extractPlugins(join(sa.path, 'cordis.yml'))
  const pb = extractPlugins(join(sb.path, 'cordis.yml'))

  const setA = new Set(pa)
  const setB = new Set(pb)

  const added = pb.filter((p) => !setA.has(p))
  const removed = pa.filter((p) => !setB.has(p))

  console.log(`diff: Stage ${a} → Stage ${b}`)
  console.log()
  if (removed.length) {
    console.log('Removed:')
    removed.forEach((p) => {
      const label = p.startsWith('@deepseek-ai/') ? p.replace('@deepseek-ai/', '') : p
      console.log(`  - ${label}`)
    })
  }
  if (added.length) {
    console.log('Added:')
    added.forEach((p) => {
      const label = p.startsWith('@deepseek-ai/') ? p.replace('@deepseek-ai/', '') : p
      console.log(`  + ${label}`)
    })
  }
  if (!added.length && !removed.length) {
    console.log('(no changes)')
  }
}