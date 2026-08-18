#!/usr/bin/env node
/**
 * Universal stage runner: qa-minimal <stage> [--trace] [--resume <id>] [--model <id>] <question...>
 *
 * Resolves stages/<NN-name>/cordis.yml, sets env vars the stage driver reads,
 * and boots it through the same 15-line cordis pattern as vendor/cordis/bin.js.
 */
import { Context } from '@deepseek-ai/cordis'
import { pathToFileURL } from 'node:url'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Loader from '@deepseek-ai/cordis-plugin-loader'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STAGES_DIR = join(__dirname, 'stages')

const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.error('usage: qa-minimal <stage> [--trace] [--resume <id>] [--model <id>] <question...>')
  console.error('stages: 0=llm-stream  1=agent-loop  2=persistence')
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