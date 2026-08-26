#!/usr/bin/env node
/**
 * Merge per-plugin museum asset fragments (lore + function animation)
 * into web/data/museum-assets.json.
 *
 *   node scripts/build-museum-assets.mjs
 *
 * Fragments live in museum-assets/<plugin-short-name>.json:
 *
 *   {
 *     "short": "dsh-tool-bash",
 *     "lore":  "two or three sentences, per docs/museum-design.md",
 *     "anim":  "bash-cursor",          // key in the animations registry
 *     "animSvg": "<svg ...>"           // only when this fragment DEFINES
 *                                      // the animation; omit to reuse one
 *   }
 *
 * The merge is conflict-free by design: batch authors only add files,
 * never edit shared ones. Output is a build artifact; do not hand-edit.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fragDir = join(root, 'museum-assets')
const outFile = join(root, 'web', 'data', 'museum-assets.json')

const lore = {}
const anims = {}
const registry = {}
let fragments = 0

if (existsSync(fragDir)) {
  for (const file of readdirSync(fragDir).filter((f) => f.endsWith('.json')).sort()) {
    const frag = JSON.parse(readFileSync(join(fragDir, file), 'utf8'))
    if (!frag.short) throw new Error(`${file}: missing "short"`)
    if (frag.lore) lore[frag.short] = frag.lore
    if (frag.anim) {
      anims[frag.short] = frag.anim
      if (frag.animSvg) {
        if (registry[frag.anim] && registry[frag.anim] !== frag.animSvg) {
          throw new Error(`${file}: animation "${frag.anim}" already defined differently`)
        }
        registry[frag.anim] = frag.animSvg
      }
    }
    fragments++
  }
}

// every assignment must resolve to a definition somewhere
const missing = Object.entries(anims).filter(([, key]) => !registry[key])
if (missing.length) {
  console.error('anim key(s) without a definition:')
  for (const [short, key] of missing) console.error(`  ${short} -> ${key}`)
  process.exit(1)
}

mkdirSync(join(root, 'web', 'data'), { recursive: true })
writeFileSync(outFile, JSON.stringify({ lore, anims, registry }, null, 2) + '\n')
console.log(`fragments: ${fragments} | lore: ${Object.keys(lore).length} | anims: ${Object.keys(anims).length} | registry defs: ${Object.keys(registry).length}`)
