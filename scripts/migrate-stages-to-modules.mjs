#!/usr/bin/env node
/**
 * One-time migration: split the hand-written stages/<NN-*>/cordis.yml files
 * into per-closure module manifests under modules/<NN>-<slug>/module.json.
 *
 * Each module holds ONLY the entries its level introduced (the delta).
 * scripts/build-stages.mjs re-assembles stage N from all closures with
 * level <= N, so new closures can be added as new module directories
 * without touching existing files.
 *
 * Section banners are canonicalized: the migration keeps the label text
 * ("persistence") and the generator re-emits "# ── label (new in LN) ──"
 * at the level that introduced it and "# ── label (inherited from LN) ──"
 * everywhere else.
 *
 * Migration is done. Kept for reference only; do not re-run.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stagesDir = join(root, 'stages')
const modulesDir = join(root, 'modules')

const SLUG = {
  '00': 'llm-stream', '01': 'agent-loop', '02': 'persistence', '03': 'fs-tools',
  '04': 'shell', '05': 'sandbox', '06': 'approval', '07': 'stateful-tasks',
  '08': 'multi-agent', '09': 'workflow', '10': 'operable', '11': 'productized',
}

function parseStage(text) {
  const lines = text.split('\n')
  let i = 0
  const headerComment = []
  while (i < lines.length && !lines[i].startsWith('- name:')) {
    if (lines[i].trim() !== '' || headerComment.length) headerComment.push(lines[i])
    i++
  }
  while (headerComment.length && headerComment.at(-1).trim() === '') headerComment.pop()

  const entries = []
  let comments = []
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('- name:')) {
      const raw = [line]
      i++
      while (i < lines.length && !lines[i].startsWith('- name:') && lines[i].trim() !== '') {
        raw.push(lines[i])
        i++
      }
      entries.push({ comments, raw })
      comments = []
    } else {
      comments.push(line)
      i++
    }
  }
  return { headerComment, entries }
}

/** configYaml minus comment lines: comments inside a config block
 *  legitimately vary between stages and are not semantic drift. */
function semanticConfig(configYaml) {
  return (configYaml ?? '').split('\n').filter((l) => !/^\s*#/.test(l) && l.trim() !== '').join('\n')
}

function entryFields(raw) {
  const name = raw[0].match(/^- name:\s+(.+)$/)[1].trim().replace(/['"]/g, '')
  const out = { name }
  const comments = []
  const configLines = []
  let inConfig = false
  for (const line of raw.slice(1)) {
    if (/^\s*#/.test(line) || line.trim() === '') {
      ;(inConfig ? configLines : comments).push(line)
      continue
    }
    const dis = line.match(/^\s+disabled:\s*(.+)$/)
    if (dis) {
      if (dis[1].includes('!!js')) out.disabledCondition = dis[1].trim()
      else if (/true/.test(dis[1])) out.disabled = true
      continue
    }
    if (/^\s+config:/.test(line)) inConfig = true
    if (inConfig) configLines.push(line)
  }
  if (comments.length) out.comments = comments
  if (configLines.length) out.configYaml = configLines.join('\n')
  return out
}

const dirs = readdirSync(stagesDir).filter((d) => /^\d{2}-/.test(d)).sort()
let accumulated = []
let accumulatedRaw = []

for (const dir of dirs) {
  const nn = dir.slice(0, 2)
  const slug = SLUG[nn] ?? dir.slice(3)
  const { headerComment, entries } = parseStage(readFileSync(join(stagesDir, dir, 'cordis.yml'), 'utf8'))

  const names = entries.map((e) => entryFields(e.raw).name)
  const removed = accumulated.filter((n) => !names.includes(n))

  // keep only the entries this level introduced, in original order,
  // and remember the section banner label that preceded each delta run.
  // Inherited entries whose config changed (e.g. the persona frozen at
  // L4) become an in-place `replace`, not a remove + re-add.
  const delta = []
  const replace = []
  let currentLabel = null
  const prevCounts = new Map()
  for (const n of accumulated) prevCounts.set(n, (prevCounts.get(n) ?? 0) + 1)
  const prevRaws = new Map()
  {
    const c = new Map()
    for (const r of accumulatedRaw) {
      const f = entryFields(r)
      const idx = (c.get(f.name) ?? 0) + 1
      c.set(f.name, idx)
      // semantic comparison only: name + disabled state + config body.
      // Comment text legitimately varies between stages and is not drift.
      prevRaws.set(`${f.name}@${idx}`, JSON.stringify({ d: f.disabled ?? false, c: f.disabledCondition ?? null, y: semanticConfig(f.configYaml) }))
    }
  }
  const emitted = new Map()
  const currentRaws = []
  for (const e of entries) {
    const f = entryFields(e.raw)
    if (f.name.startsWith('./')) continue // the stage-local driver is appended by the generator
    const banner = e.comments.find((l) => /^#\s*──/.test(l))
    if (banner) currentLabel = banner
    // multi-instance plugins (same name mounted twice) are delta when the
    // occurrence index exceeds what earlier levels already had
    const idx = (emitted.get(f.name) ?? 0) + 1
    emitted.set(f.name, idx)
    currentRaws.push(e.raw)
    if (idx <= (prevCounts.get(f.name) ?? 0)) {
      const before = prevRaws.get(`${f.name}@${idx}`)
      const now = JSON.stringify({ d: f.disabled ?? false, c: f.disabledCondition ?? null, y: semanticConfig(f.configYaml) })
      if (before !== undefined && before !== now) {
        replace.push({ name: f.name, occurrence: idx, entry: f })
      }
      continue
    }
    delta.push({ label: currentLabel, entry: f, preComments: e.comments.filter((l) => l !== banner && !/^#\s*──/.test(l)) })
  }

  // group delta entries into sections by their banner label
  const sections = []
  for (const d of delta) {
    let sec = sections.find((s) => s.label === d.label)
    if (!sec) {
      sec = { label: d.label, entries: [] } // label stays null when the stage has no banner
      sections.push(sec)
    }
    if (d.preComments.length) d.entry.comments = [...d.preComments, ...(d.entry.comments ?? [])]
    sec.entries.push(d.entry)
  }
  // strip the label's own parenthetical tag; generator re-adds it
  for (const sec of sections) {
    if (sec.label) sec.label = sec.label.replace(/^#\s*──\s*/, '').replace(/\s*\((new in|inherited from) L\d+\)\s*─*\s*$/, '').trim()
  }

  const pkg = JSON.parse(readFileSync(join(stagesDir, dir, 'package.json'), 'utf8'))
  const driverText = readFileSync(join(stagesDir, dir, 'driver.mjs'), 'utf8')
  // the default question may be a multi-line concatenated expression —
  // keep the raw JS verbatim
  const qMulti = driverText.match(/QA_QUESTION\s*\n\s*\|\|([\s\S]*?)\n\s*const model/)
  const qOne = driverText.match(/QA_QUESTION\s*\|\|\s*(['"`])((?:\\.|(?!\1).)*)\1/)
  const q = qMulti ?? qOne

  const mod = {
    level: Number(nn),
    order: 0,
    stageMeta: {
      dir,
      title: headerComment[0]?.replace(/^#\s+Stage\s+\d+\s+—\s+/, '') ?? dir,
      packageName: pkg.name,
      headerComment,
      driverQuestion: q ? (qOne && !qMulti ? q[2] : q[1].trim().replace(/^['"`]|['"`]$/g, '').replace(/'\s*\+\s*'/g, '')) : undefined,
    },
    ...(removed.length ? { remove: removed } : {}),
    ...(replace.length ? { replace } : {}),
    sections,
  }

  const modDir = join(modulesDir, `${nn}-${slug}`)
  mkdirSync(modDir, { recursive: true })
  writeFileSync(join(modDir, 'module.json'), JSON.stringify(mod, null, 2) + '\n')
  console.log(`${dir} -> modules/${nn}-${slug} (${sections.length} sections, ${delta.length} delta entries, remove: ${removed.length})`)
  accumulated = names.filter((n) => !n.startsWith('./'))
  accumulatedRaw = currentRaws
}
