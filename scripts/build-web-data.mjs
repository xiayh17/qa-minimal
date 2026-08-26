#!/usr/bin/env node
/**
 * Generate the frontend's data files from the repository's source of truth.
 *
 *   node scripts/build-web-data.mjs
 *
 * Inputs:
 *   stages/<NN-name>/cordis.yml   mounted plugin entries (order, config keys, disabled)
 *   node_modules/@deepseek-ai/*   inject exports + Service registration keys
 *
 * Outputs (all regenerated, never hand-edited):
 *   web/data/stages.json    per-level entries + delta vs previous level
 *   web/data/catalog.json   per-package facts: inject, provides, description
 *   web/data/graph.json     inject → provider edges across the whole catalog
 *
 * The script reads cordis.yml line-by-line instead of using a YAML parser
 * because the files contain `!!js` tags that only the cordis include loader
 * understands. For the data the web app needs (names, order, disabled,
 * top-level config keys) a line scan is exact.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stagesDir = join(root, 'stages')
const outDir = join(root, 'web', 'data')

// ── cordis.yml line scan ─────────────────────────────────────────────

function parseStage(file) {
  const text = readFileSync(file, 'utf8')
  const titleMatch = text.match(/^#\s+Stage\s+(\d+)\s+—\s+(.+)$/m)
  const entries = []
  let current = null
  for (const line of text.split('\n')) {
    const nameMatch = line.match(/^- name:\s+(.+)$/)
    if (nameMatch) {
      current = { name: nameMatch[1].trim().replace(/['"]/g, ''), disabled: false, configKeys: [] }
      entries.push(current)
      continue
    }
    if (!current) continue
    const dis = line.match(/^\s+disabled:\s*(.+)$/)
    if (dis) {
      if (dis[1].includes('!!js')) current.disabledCondition = dis[1].replace('!!js', '').trim()
      else current.disabled = /true/.test(dis[1])
    }
    const cfg = line.match(/^ {2}config:\s*$/)
    if (cfg) current.inConfig = true
    else if (current.inConfig) {
      const key = line.match(/^ {4}([a-zA-Z_][\w]*):/)
      if (key) current.configKeys.push(key[1])
      else if (!/^\s+#|^\s*$/.test(line) && !/^ {4}/.test(line)) current.inConfig = false
    }
  }
  return {
    level: Number(titleMatch?.[1] ?? -1),
    title: titleMatch?.[2] ?? '(untitled)',
    entries,
  }
}

// ── package facts ────────────────────────────────────────────────────

const PREFIX = '@deepseek-ai/'

async function packageFacts(shortName) {
  const pkgDir = join(root, 'node_modules', PREFIX, shortName)
  const facts = { inject: [], provides: [], description: '' }
  try {
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    facts.description = pkgJson.description ?? ''
    facts.version = pkgJson.version ?? ''
  } catch { /* not installed — entry recorded without facts */ }

  // inject: declared as a static export on the plugin module.
  try {
    const mod = await import(PREFIX + shortName)
    const inject = mod.inject ?? mod.default?.inject
    if (Array.isArray(inject)) facts.inject = inject
  } catch (err) {
    facts.importError = String(err?.code ?? err?.message ?? err)
  }

  // provides: three ways a package makes a service appear on ctx —
  //   1. own Service subclass: super(ctx, "<key>")
  //   2. explicit provide("<key>") call (e.g. dsh-storage-domain)
  //   3. extends a seam base class imported from another dsh package
  //      (e.g. LocalFileSystem extends FileSystem from dsh-fs) — inherit
  //      the base package's key recursively.
  try {
    const src = readFileSync(join(pkgDir, 'lib', 'index.js'), 'utf8')
    const own = new Set([
      ...[...src.matchAll(/super\(ctx,\s*"([^"]+)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/provide\(\s*"([^"]+)"/g)].map((m) => m[1]),
    ])
    facts.provides = [...own]
    if (facts.provides.length === 0) {
      const inherited = new Set()
      for (const { pkg } of extendedBasePackages(src)) {
        for (const key of providesOfPackage(pkg, new Set([shortName]))) inherited.add(key)
      }
      facts.provides = [...inherited]
      if (inherited.size) facts.providesInherited = true
    }
  } catch { /* no lib/index.js */ }
  return facts
}

/**
 * Named and default imports from other dsh packages that this source
 * actually uses as a base class (`extends X`). Error classes are excluded:
 * extending HarnessError does not make a package an LLM provider.
 */
function extendedBasePackages(src) {
  const out = []
  for (const m of src.matchAll(/import\s+(?:(\w+)\s*,\s*)?(?:\{([^}]+)\}\s*)?from\s*"@deepseek-ai\/(dsh-[\w-]+)"/g)) {
    const names = [m[1], ...(m[2] ?? '').split(',').map((s) => s.trim().split(/\s+as\s+/).pop())]
      .filter(Boolean)
    const extended = names.some((n) => !n.endsWith('Error') && new RegExp(`extends ${n}\\b`).test(src))
    if (extended) out.push({ pkg: m[3] })
  }
  return out
}

const providesCache = {}
function providesOfPackage(shortName, seen) {
  if (seen.has(shortName)) return []
  if (providesCache[shortName]) return providesCache[shortName]
  seen.add(shortName)
  let keys = []
  try {
    const src = readFileSync(join(root, 'node_modules', PREFIX, shortName, 'lib', 'index.js'), 'utf8')
    keys = [...src.matchAll(/super\(ctx,\s*"([^"]+)"/g)].map((m) => m[1])
    if (keys.length === 0) {
      for (const { pkg } of extendedBasePackages(src)) {
        keys.push(...providesOfPackage(pkg, seen))
      }
    }
  } catch { /* package not installed */ }
  providesCache[shortName] = [...new Set(keys)]
  return providesCache[shortName]
}

// ── main ─────────────────────────────────────────────────────────────

const dirs = readdirSync(stagesDir).filter((d) => /^\d{2}-/.test(d)).sort()
const stages = dirs.map((d) => ({ dir: d, ...parseStage(join(stagesDir, d, 'cordis.yml')) }))
stages.sort((a, b) => a.level - b.level)

// delta vs previous level (by plugin name, order-preserving)
stages.forEach((stage, i) => {
  const prev = i > 0 ? new Set(stages[i - 1].entries.map((e) => e.name)) : new Set()
  const self = new Set(stage.entries.map((e) => e.name))
  stage.added = stage.entries.map((e) => e.name).filter((n) => !prev.has(n))
  stage.removed = (i > 0 ? stages[i - 1].entries.map((e) => e.name) : []).filter((n) => !self.has(n))
})

// catalog facts for every mounted package
const names = new Set()
for (const s of stages) for (const e of s.entries) {
  if (e.name.startsWith(PREFIX)) names.add(e.name.slice(PREFIX.length))
}
const catalog = {}
for (const name of [...names].sort()) {
  catalog[name] = await packageFacts(name)
}

// graph edges: consumer plugin → provider plugin for each injected service
const providersByService = {}
for (const [name, facts] of Object.entries(catalog)) {
  for (const key of facts.provides) (providersByService[key] ??= []).push(name)
}
const edges = []
for (const [name, facts] of Object.entries(catalog)) {
  for (const service of facts.inject) {
    for (const provider of providersByService[service] ?? []) {
      edges.push({ from: name, service, to: provider })
    }
  }
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'stages.json'), JSON.stringify(stages.map(({ dir, ...s }) => s), null, 2) + '\n')
writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
writeFileSync(join(outDir, 'graph.json'), JSON.stringify({ providersByService, edges }, null, 2) + '\n')

// summary for the human running the script
console.log(`stages: ${stages.length}`)
for (const s of stages) {
  console.log(`  L${s.level} ${s.title} — ${s.entries.length} entries (+${s.added.length} / -${s.removed.length})`)
}
console.log(`catalog packages: ${Object.keys(catalog).length}`)
console.log(`graph edges: ${edges.length} across ${Object.keys(providersByService).length} services`)
const unmounted = Object.entries(catalog).filter(([, f]) => f.importError)
if (unmounted.length) {
  console.log('packages that failed to import (inject unavailable):')
  for (const [n, f] of unmounted) console.log(`  ${n}: ${f.importError}`)
}
