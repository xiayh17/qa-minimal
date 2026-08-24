# Stage 11 — Productized

The fully accumulated agent — sandbox, approval, todos, plan mode, goals,
workspace registry, subagents, jobs, a real workflow engine, token
metering, compaction, retry, invariants, session projections — plus the
**product-config seam**, now with real providers.

L11 = L10 + product configuration.  The architecture concept is
**composition → product config**: until L10 the model route, the API-key
reference and the sandbox/approval mode were frozen into `cordis.yml` —
changing them meant editing the composition.  This stage mounts the
providers that turn the composition into a product.

## What changed from Stage 10

```diff
  (all Stage 10 plugins are inherited)
+ @deepseek-ai/dsh-settings           abstract settings seam — disabled (provider registers "settings")
+ @deepseek-ai/dsh-credentials        abstract credential seam — disabled (provider registers "credentials")
+ @deepseek-ai/dsh-settings-file      file-backed settings provider (settings.yaml, watched)
+ @deepseek-ai/dsh-credentials-local  file-backed credential provider (env layered over .credentials.yaml)
```

## The seam, now live

- **`dsh-settings-file`** serves `ctx.settings`: one user-editable
  `settings.yaml` whose per-namespace sections layer *over* each plugin's
  composition base (schema defaults → composition base → user document).
  `watch: true` (the default) re-resolves on external edits — hot swap
  without a restart.  `dsh-llm-pi-ai` already imports
  `installSettingsSection()`: with this provider mounted, its `llm-pi-ai`
  namespace (providers, models, `retryPolicy`) is a live user document.
- **`dsh-credentials-local`** serves `ctx.credentials`: configuration
  carries *references* to secrets (`apiKeyEnv: QA_API_KEY`), never the
  secrets.  The provider layers the live process environment over its
  managed `.credentials.yaml`, and consumers resolve **per operation** —
  a rotated secret reaches the very next request.  Verified in this
  stage: `resolve(QA_API_KEY)` → `{ value, source: 'env' }`, and
  `describe()` answers `{ configured: true, source: 'env', writable:
  false }` (the environment shadows the file, so writes reject loudly
  instead of pretending).
- **The abstract entries stay disabled**, under one rule used throughout
  this composition: a provider extends its abstract class and registers
  the same service name, cordis registers one service per name, so
  mounting both fails the boot.  Same pattern as `dsh-jobs` /
  `dsh-jobs-local`, `dsh-compaction` / `dsh-compaction-basic`, and
  `dsh-workflow` / `dsh-workflow-worker-thread`.
- Both providers take an explicit `path` inside the disposable workspace
  (`./settings.yaml`, `./.credentials.yaml`) instead of the `$DSH_HOME`
  default — the same convention as persistence's `root: ./sessions`.
  `dsh-home-paths` and `dsh-atomic-write` are libraries the providers
  import, not plugins — nothing to mount.

## Known gaps at 0.1.0-rc.6

| Entry | State | Why |
|---|---|---|
| `dsh-session-telemetry` | disabled | contract-only package — no plugin entry (no default export, no `apply`); a concrete backend would compose its capture coordinator |
| `dsh-user-questions` | mounted, no UI provider | the seam's `ask()` validates and then fails loud with `NO_PROVIDER` in this headless composition — plan-mode's reviewed exit reports it clearly instead of blocking |
| preset / bundle / HMR | not packages | the roadmap lists them for this level; at rc.6 they live inside the dsh CLI's `dsh-base` profile bundle, not on the plugin graph |

## Run

```sh
qa-minimal 11 'Fix the divide-by-zero bug in src/calculator.js and run the tests'
qa-minimal 11 --trace 'Fix the divide-by-zero bug in src/calculator.js and run the tests'

# The static demo of this stage:
qa-minimal inspect 11    # 54 mounted entries — the full accumulated graph
qa-minimal diff 10 11    # exactly the product-config closure
```

> Stages 3+ run in a disposable temp workspace (`tmp/qa-<run>/`), so the
> providers' `settings.yaml` / `.credentials.yaml` / `storage.sqlite`
> files are created and discarded per run.

## What you see

`--trace` shows the accumulated grammar: `permission/preset`,
`sandbox/mode`, `approval/policy` at startup; `todo/write` snapshots,
goal-tool calls, subagent/job/workflow tooling armed; and — armed by
`dsh-llm-retry` with its default `normal / maxRetries 2` policy —
`llm/retry` + `llm/retry-started` pairs when a request fails transiently.
Every request now also resolves its API key through `ctx.credentials`
(invisible in the trace unless it fails); edit `settings.yaml` mid-run and
the settings watcher re-resolves the `llm-pi-ai` namespace live.

The L4 → L11 progression keeps one variable frozen throughout: same model,
same tools, same question, **same persona** (byte-for-byte identical from
L4 onward).  Everything else — safety, state, delegation, context
management, operability, product config — is the plugin graph growing.
