/**
 * Disposable workspace helper.
 *
 * Stages 3+ produce real side effects (file writes, bash commands).  To keep
 * experiments reproducible and avoid polluting the git-tracked fixture tree,
 * each run copies fixtures/demo-project into a temp root and chdir's there
 * before the Cordis plugin graph boots.
 *
 * Layout:
 *
 *   tmp/qa-<ts>-<rand>/
 *     workspace/          ← agent cwd (fixtures/demo-project copy)
 *     outside/            ← sibling dir outside the workspace boundary
 *
 * The agent sees `src/calculator.js` (relative to workspace).
 * `../outside.txt` resolves to the sibling — outside the workspace but
 * inside the disposable temp root, so L4 (no sandbox) can write there
 * without touching the real repo, and L5 (sandbox) denies the same path.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const FIXTURE = join(REPO_ROOT, 'fixtures', 'demo-project')
const TMP_ROOT = join(REPO_ROOT, 'tmp')

let activeRoot = null

/**
 * Create a disposable workspace and return its paths.
 * Call cleanupWorkspace() when done (registered automatically on exit).
 */
export function setupWorkspace() {
  const stamp = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const root = join(TMP_ROOT, stamp)
  const workspace = join(root, 'workspace')
  const outside = join(root, 'outside')

  mkdirSync(workspace, { recursive: true })
  mkdirSync(outside, { recursive: true })
  cpSync(FIXTURE, workspace, { recursive: true })

  activeRoot = root
  process.on('exit', () => cleanupWorkspace())

  return { root, workspace, outside }
}

/** Remove the temp root if one was created. */
export function cleanupWorkspace() {
  if (activeRoot) {
    rmSync(activeRoot, { recursive: true, force: true })
    activeRoot = null
  }
}