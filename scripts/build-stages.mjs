#!/usr/bin/env node
/**
 * Assemble every stage from its closure modules.
 *
 *   node scripts/build-stages.mjs            # write stages/<NN-*>/
 *   node scripts/build-stages.mjs --check    # diff against existing stages
 *
 * Stage N = all closures with level <= N (sorted by level, then order),
 * minus each closure's `remove` list. For every stage the generator emits:
 *
 *   cordis.yml    header comment + accumulated sections + ./driver.mjs
 *   package.json  accumulated @deepseek-ai/* deps at the pinned dsh version
 *   driver.mjs    shared driver template + the stage's default question
 *
 * Section banners are canonical: "# ── label (new in LN) ──" at the level
 * that introduced the closure, "# ── label (inherited from LN) ──" after.
 * modules/ is the source of truth; stages/ is a build artifact. Do not
 * hand-edit generated cordis.yml / package.json / driver.mjs files —
 * edit the module instead and re-run this script.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modulesDir = join(root, 'modules')
const checkOnly = process.argv.includes('--check')

// ── load modules ─────────────────────────────────────────────────────

const closures = readdirSync(modulesDir)
  .filter((d) => /^\d{2}-/.test(d) && existsSync(join(modulesDir, d, 'module.json')))
  .map((d) => ({ slug: d, ...JSON.parse(readFileSync(join(modulesDir, d, 'module.json'), 'utf8')) }))
  .sort((a, b) => a.level - b.level || (a.order ?? 0) - (b.order ?? 0))

const stageMetas = new Map()
for (const c of closures) {
  if (c.stageMeta) {
    if (stageMetas.has(c.level)) throw new Error(`duplicate stageMeta at level ${c.level}`)
    stageMetas.set(c.level, c.stageMeta)
  }
}

// Version anchor: dsh-invariants is guaranteed to be present (it is a
// root package.json dep). dsh-llm itself is NOT — it only appears in
// stage manifests, so anchoring on it breaks when node_modules is pruned.
const dshVersion = JSON.parse(readFileSync(join(root, 'node_modules', '@deepseek-ai', 'dsh-invariants', 'package.json'), 'utf8')).version

/** npm package name for a module entry: subpath entries like
 *  @deepseek-ai/dsh-tool-x/list-agents resolve to their package root. */
function packageNameOf(entryName) {
  return entryName.split('/').slice(0, 2).join('/')
}

// ── emission helpers ─────────────────────────────────────────────────

const WIDTH = 80
function banner(label, tag) {
  const head = `# ── ${label.trim()} (${tag}) `
  return head.padEnd(WIDTH, '─')
}

function entryLines(entry) {
  const lines = []
  for (const c of entry.comments ?? []) lines.push(c)
  const quoted = entry.name.startsWith('@') ? `'${entry.name}'` : entry.name
  lines.push(`- name: ${quoted}`)
  if (entry.disabled) lines.push('  disabled: true')
  if (entry.disabledCondition) lines.push(`  disabled: ${entry.disabledCondition}`)
  if (entry.configYaml) lines.push(entry.configYaml)
  return lines
}

function emitCordis(level, meta) {
  const lines = [...meta.headerComment, '']
  // accumulated entries in mount order, each tagged with the closure and
  // section it came from. `remove` drops by name (provider swap), and
  // `replace` substitutes a config in place (position preserved).
  let acc = []
  for (const c of closures.filter((c) => c.level <= level)) {
    if (c.remove?.length) acc = acc.filter((x) => !c.remove.includes(x.entry.name))
    for (const r of c.replace ?? []) {
      let seen = 0
      for (const x of acc) {
        if (x.entry.name !== r.name) continue
        seen++
        if (seen === r.occurrence) { x.entry = r.entry; break }
      }
    }
    for (const sec of c.sections ?? []) {
      for (const e of sec.entries) acc.push({ closure: c, sec, entry: e })
    }
  }
  let lastSec = null
  for (const x of acc) {
    if (x.sec !== lastSec) {
      lastSec = x.sec
      if (x.sec.label) {
        const tag = x.closure.level === level ? `new in L${x.closure.level}` : `inherited from L${x.closure.level}`
        lines.push(banner(x.sec.label, tag))
      }
    }
    lines.push(...entryLines(x.entry))
  }
  lines.push('- name: ./driver.mjs')
  return lines.join('\n') + '\n'
}

function accumulatedDeps(level) {
  const counts = new Map()
  for (const c of closures.filter((c) => c.level <= level)) {
    for (const r of c.remove ?? []) counts.delete(packageNameOf(r))
    for (const sec of c.sections ?? []) {
      for (const e of sec.entries) {
        if (!e.name.startsWith('@deepseek-ai/')) continue
        const pkg = packageNameOf(e.name)
        counts.set(pkg, (counts.get(pkg) ?? 0) + 1)
      }
    }
  }
  return counts
}

function emitPackageJson(level, meta) {
  const deps = {}
  for (const name of accumulatedDeps(level).keys()) deps[name] = dshVersion
  return JSON.stringify({
    name: meta.packageName,
    version: '0.2.0',
    private: true,
    type: 'module',
    dependencies: Object.fromEntries(Object.entries(deps).sort()),
  }, null, 2) + '\n'
}

// The drivers differ only in the header comment and the default question.
// Use stage 11's driver as the template.
const TEMPLATE = readFileSync(join(root, 'stages', '11-productized', 'driver.mjs'), 'utf8')

function emitDriver(level, meta) {
  const header = [
    '/**',
    ` * Stage ${String(level).padStart(2, '0')} driver: ${meta.title}.`,
    ' *',
    ` * ${meta.driverStory ?? `L${level} stage of the qa-minimal ladder.`}`,
    ' *',
    ' * Generated by scripts/build-stages.mjs from modules/. Do not edit here.',
    ' */',
  ].join('\n')
  const body = TEMPLATE
    .replace(/\/\*\*[\s\S]*?\*\//, header)
    .replace(
      /const question = process\.env\.QA_QUESTION\n\s*\|\|([\s\S]*?)\n(\s*const model)/,
      `const question = process.env.QA_QUESTION\n    || ${JSON.stringify(meta.driverQuestion ?? 'Explain what this stage adds.')}\n$2`,
    )
  return body
}

// ── build all stages ─────────────────────────────────────────────────

let drift = 0
const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null
for (const [level, meta] of [...stageMetas.entries()].sort((a, b) => a[0] - b[0])) {
  if (only !== null && level !== only) continue
  const outDir = join(root, 'stages', meta.dir)
  const outputs = {
    'cordis.yml': emitCordis(level, meta),
    'package.json': emitPackageJson(level, meta),
    'driver.mjs': emitDriver(level, meta),
  }
  if (checkOnly) {
    for (const [file, content] of Object.entries(outputs)) {
      const path = join(outDir, file)
      const current = existsSync(path) ? readFileSync(path, 'utf8') : null
      if (current !== content) {
        drift++
        console.log(`DRIFT ${meta.dir}/${file}`)
        if (process.argv.includes('--diff') && current !== null) {
          writeFileSync('/tmp/generated.out', content)
          writeFileSync('/tmp/current.out', current)
          try {
            console.log(execFileSync('diff', ['-u', '/tmp/current.out', '/tmp/generated.out'], { encoding: 'utf8' }).slice(0, 2000))
          } catch (e) {
            console.log(String(e.stdout ?? '').slice(0, 2000))
          }
        }
      }
    }
    continue
  }
  mkdirSync(outDir, { recursive: true })
  for (const [file, content] of Object.entries(outputs)) {
    writeFileSync(join(outDir, file), content)
  }
  console.log(`built stages/${meta.dir} (${accumulatedDeps(level).size} deps)`)
}

if (checkOnly) {
  console.log(drift ? `\n${drift} file(s) differ from modules` : '\nstages match modules')
  process.exit(drift ? 1 : 0)
}
