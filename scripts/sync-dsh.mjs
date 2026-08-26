#!/usr/bin/env node
/**
 * Sync every @deepseek-ai/* dependency in the repo to one dsh version,
 * reinstall, regenerate the web data layer, and smoke-test all stages.
 *
 *   node scripts/sync-dsh.mjs                # use the npm `next` dist-tag
 *   node scripts/sync-dsh.mjs 0.1.1-rc.2     # pin an explicit version
 *   node scripts/sync-dsh.mjs --check        # only report current vs latest
 *
 * Flags:
 *   --allow-mixed   keep packages that have not published the target
 *                   version at their current pin (default: abort)
 *   --skip-smoke    stop after npm install + web data regeneration
 *
 * This is the supported upgrade path. Hand-editing versions in one
 * package.json only will silently mix releases.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const allowMixed = args.includes('--allow-mixed')
const skipSmoke = args.includes('--skip-smoke')
const explicit = args.find((a) => /^\d+\./.test(a))

const npmView = (args) => {
  try {
    return execFileSync('npm', ['view', ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

// ── collect package.json files and their @deepseek-ai deps ──────────

const pkgFiles = [join(root, 'package.json')]
for (const d of readdirSync(join(root, 'stages')).filter((d) => /^\d{2}-/.test(d))) {
  pkgFiles.push(join(root, 'stages', d, 'package.json'))
}
const manifests = pkgFiles.map((f) => ({ file: f, json: JSON.parse(readFileSync(f, 'utf8')) }))
const deps = new Map() // name -> Set of current versions
for (const { json } of manifests) {
  for (const [name, version] of Object.entries(json.dependencies ?? {})) {
    if (!name.startsWith('@deepseek-ai/dsh-')) continue
    if (!deps.has(name)) deps.set(name, new Set())
    deps.get(name).add(version)
  }
}

// ── resolve target version ───────────────────────────────────────────

const target = explicit ?? npmView(['@deepseek-ai/dsh-llm', 'dist-tags.next'])
if (!target) {
  console.error('cannot resolve a target version; pass one explicitly')
  process.exit(1)
}
const current = [...new Set([...deps.values()].flatMap((s) => [...s]))]
console.log(`current pins: ${current.join(', ') || '(none)'}`)
console.log(`target:       ${target}`)
if (current.length === 1 && current[0] === target) {
  console.log('already on target version — nothing to do')
  if (checkOnly) process.exit(0)
}
if (checkOnly) process.exit(0)

// ── verify every package has published the target ────────────────────

const laggards = []
for (const name of [...deps.keys()].sort()) {
  const versions = npmView([name, 'versions', '--json'])
  const list = versions ? JSON.parse(versions) : []
  if (!list.includes(target)) laggards.push({ name, latest: list.at(-1) })
}
if (laggards.length && !allowMixed) {
  console.error(`\n${laggards.length} package(s) have not published ${target}:`)
  for (const l of laggards) console.error(`  ${l.name} (newest: ${l.latest})`)
  console.error('\nre-run with --allow-mixed to keep them at their current pin')
  process.exit(1)
}

// ── rewrite manifests ────────────────────────────────────────────────

const laggardNames = new Set(laggards.map((l) => l.name))
for (const { file, json } of manifests) {
  for (const name of Object.keys(json.dependencies ?? {})) {
    if (!name.startsWith('@deepseek-ai/dsh-')) continue
    if (laggardNames.has(name)) continue
    json.dependencies[name] = target
  }
  json.dependencies = Object.fromEntries(Object.entries(json.dependencies).sort())
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
}
console.log(`\nrewrote ${manifests.length} package.json files`)

// ── install, rebuild web data, smoke ─────────────────────────────────

const run = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  return r.status ?? 1
}

if (run('npm', ['install']) !== 0) process.exit(1)
if (run('node', ['scripts/build-web-data.mjs']) !== 0) process.exit(1)
if (skipSmoke) process.exit(0)
process.exit(run('node', ['scripts/smoke-stages.mjs']))
