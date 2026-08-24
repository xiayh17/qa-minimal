# Stage 09 — Workflow Agent

The same sandboxed, approval-gated, multi-agent harness as Stage 08, but now
the session is a **task runtime**: token accounting drives compaction, a
fresh-agent loop (`ralph`) runs bounded multi-round objectives, and the
workflow seam orchestrates them.

L9 = L8 + long-task runtime closure.  Everything from Stage 06 is still here
— sandbox, approval, FS, shell, search, persistence, resume — plus the L7
stateful-task closure (todo list, plan mode, goals, workspace registry) and
the L8 multi-agent closure (subagent registry, spawn/fork providers,
background jobs).

## What changed from Stage 08

```diff
  (all Stage 08 plugins — L6 spine + L7 stateful tasks + L8 multi-agent are inherited)
+ @deepseek-ai/dsh-workflow                       workflow seam (abstract — disabled, see seam note below)
+ @deepseek-ai/dsh-workflow-worker-thread         the concrete engine: runs orchestration scripts in a worker thread
+ @deepseek-ai/dsh-tool-ralph                     `ralph` tool: fresh-agent loop over workflow + subagent seams
+ @deepseek-ai/dsh-token-meter                    ctx.tokenMeter: token accounting folded from the event log
+ @deepseek-ai/dsh-compaction                     compaction seam (abstract — disabled, see seam note below)
+ @deepseek-ai/dsh-compaction-basic               token-meter-driven auto-compaction engine
+ @deepseek-ai/dsh-compaction-tool-result-pruner  deterministic oversized tool-result pruning
```

## The architectural step: conversation → task runtime

Up to L8 the session is a conversation that grows unboundedly — fine for
short tasks, fatal for long ones.  L9 closes the loop that makes long
multi-round tasks sustainable:

```
tokenMeter  measures context pressure from the session log
     │      (per-session folds over request/header, assistant/message, step/*)
     ▼
compaction-basic  auto-compacts when pressure ≥ thresholdRatio × contextWindow
     │            (old surface events fold into one summary node;
     │             the most recent retainRatio stays verbatim)
     ▼
tool-result-pruner  bounds oversized tool outputs deterministically
                    (head 4096 + marker + tail 1024 over 8192 chars)
     ▼
ralph  runs a bounded fresh-agent loop: one fresh structured-output child
       per round, carrying only the immutable objective plus the previous
       bounded handoff — long tasks no longer bloat one context
```

Config decisions (all schema defaults made explicit for reading):

| Plugin | Config | Why |
|---|---|---|
| `dsh-workflow-worker-thread` | — | defaults: `provider: "spawn"` (matches ralph's `subagentProvider`), `maxTotalAgents: 1000`, `maxItemsPerCall: 4096`, `syncTimeoutMs: 5000`, `disposeGraceMs: 5000`; inject `["subagents"]` is satisfied |
| `dsh-compaction-basic` | `thresholdRatio: 0.8`, `retainRatio: 0.16`, `auto: true` | compact at 80% of the routed model's `contextWindow` (1M here); keep the newest ~16% verbatim; `auto` enables between-step pressure checks and request-overflow recovery. `summarizationProvider/Model` stay unset: the empty pair reuses the compacted agent's own routed model |
| `dsh-tool-ralph` | `subagentProvider: spawn`, `maxRounds: 256` | ralph requires a *fresh* provider (`inheritsParentContext: false`) with structured-output support — `spawn` qualifies, `fork` is rejected at execution time |
| `dsh-token-meter` | — | the schema is empty and rejects every key ("no settings are supported") |
| `dsh-compaction-tool-result-pruner` | — | defaults: `thresholdChars 8192`, `headChars 4096`, `tailChars 1024` |

Mount order note: `dsh-compaction-basic` declares
`inject = ["llm", "tokenMeter", "sessions"]`.  Cordis activates it once those
services exist regardless of YAML order, but the file lists
`dsh-token-meter` first so the data dependency reads top-to-bottom:
meter → engine → pruner (the pruner injects `tokenMeter` too).

## Disabled entries: the seam pattern, not gaps

Three entries are mounted `disabled: true` — all abstract Service
Definitions, listed so `inspect`/`diff` show the full closure while exactly
one concrete implementation carries the runtime:

- **`dsh-jobs`** (L8) — its constructor throws by design ("load an
  implementation such as dsh-jobs-local instead").  `dsh-jobs-local` carries
  the runtime.
- **`dsh-compaction`** (L9) — mounting it alongside `dsh-compaction-basic`
  fails with duplicate service `compaction`.
- **`dsh-workflow`** (L9) — same story: `dsh-workflow-worker-thread`
  registers `ctx.workflowEngine`; mounting both would duplicate-register
  the service.

Earlier rc.6 package gaps are all resolved: `dsh-user-questions`,
`dsh-storage` / `dsh-storage-domain` / `dsh-storage-sqlite`,
`dsh-subagent-in-process-driver`, `dsh-tool-jobs` and
`dsh-workflow-worker-thread` are now installed, so `dsh-plan-mode`,
`dsh-workspace`, both in-process subagent providers and the workflow engine
are enabled for real.  (`dsh-subagent-in-process-driver` itself is a pure
library — `startInProcessRun` — shared by the two providers, not a
mountable plugin.)  One cosmetic note: `dsh-storage-sqlite` uses
`node:sqlite`, so Node prints an experimental-feature warning at boot.

One inherited entry also deviates from its Stage 06 source:
**`dsh-tool-fs-search`** carries `config: { sampleOverCapGlobResults: true }`
here.  The rc.6 schema made that key required, so Stage 06's config-less
entry no longer passes validation — Stage 06 itself fails to boot against
the pinned rc.6 tree.  Its yml is frozen by the stage-isolation rule, so
the key is supplied in this stage's copy.

## Run

```sh
# Long multi-round task: plan with todos, then create → run → extend → re-run
qa-minimal 9
qa-minimal 9 --trace

# Or supply your own long task
qa-minimal 9 --trace "Refactor src/calculator.js step by step: plan with the
  todo list, extract a parse module, run the tests after each change"

# Resume still works — compaction folds are session events, so a resumed
# session reloads the summarized surface
qa-minimal 9 --resume <session-id> "Where were we?"
```

> Stages 3+ run in a disposable temp workspace.  The default question's
> `hello.py` is created under `tmp/qa-<run>/` and never touches the
> git-tracked fixture tree.

## What you see

Under `--trace`, a long run shows the L7–L9 event vocabulary layered on top
of the L1 turn/step stream:

```
  [trace] turn/start
  [trace] todo/write            ← the model plans the multi-step task
  [trace] tool/call             ← write hello.py
  [trace] tool/result
  [trace] tool/call             ← bash: python3 hello.py
  [trace] tool/result
  [trace] todo/write            ← step done, next step in_progress
  ...                           ← iterate: edit → run → re-run
  [trace] turn/end
```

On a genuinely long session you would additionally see the runtime closure
fire:

```
  [trace] compaction/start      ← pressure crossed 80% of the context window
  [trace] compaction/summary    ← old surface folded into one summary node
  [trace] compaction/end
  [trace] compaction/prune      ← an oversized tool result was head/tail-pruned
  [trace] subagent/descriptor   ← ralph round: fresh child established
  [trace] subagent/start / subagent/end
```

(The smoke run won't reach these: the default task is short and the dummy
endpoint never answers.  With a real endpoint and a long enough task the
closure is fully live — the engine, both providers, and ralph's inject are
all satisfied.)

## The L6 → L9 progression

Same model, same persona (byte-for-byte frozen from L4), same sandbox and
approval gates.  What changed is what the session *is*:

| Stage | The session is... | Long-task behavior |
|---|---|---|
| L6 | a guarded conversation | context grows until the request overflows |
| L7 | a stateful conversation | todos/goals track work, but tokens still grow |
| L8 | a conversation that can delegate | subagents fan out, each still unbounded |
| L9 | a task runtime | token pressure is measured, compaction folds history, ralph bounds each round |

This is "一切皆插件" at the runtime layer: nothing about the agent loop
changed — the loop still drives turns and steps.  Measuring, folding, and
re-bounding the conversation are three more plugins on the same seam
pattern.
