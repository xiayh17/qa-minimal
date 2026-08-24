# Stage 10 — Operable Harness

The full L9 workflow agent, now wrapped in an **operability closure**:
transient provider failures heal themselves (retry), the system can be
observed and measured (telemetry seam + session stats), and the durable
log is audited at runtime (invariants).

L10 = L9 + Operability.  Everything from Stage 09 is still here — the
sandboxed, approval-gated, persistent agent with todo/plan/goal state,
subagent and job registries, token metering, compaction and the ralph
workflow tool — plus the five L10 packages.

## What changed from Stage 09

```diff
  (all Stage 09 plugins are inherited)
+ @deepseek-ai/dsh-llm-retry          retries transient provider failures with backoff
+ @deepseek-ai/dsh-invariants         ctx.invariants: runtime assertion registry
+ @deepseek-ai/dsh-session-telemetry  telemetry seam (disabled — no backend, see "Gaps")
+ @deepseek-ai/dsh-session-projection ctx.sessionProjections registry (mounted here)
+ @deepseek-ai/dsh-session-stats      sessionStats projection unit — ACTIVE at this level
```

## The architecture concept: "runs" ≠ "operable"

A harness that *runs* produces answers.  A harness that is *operable*
survives faults, explains itself, and can be measured:

| Plugin | Role | What it buys |
|---|---|---|
| `dsh-llm-retry` | self-healing | hooks the loop's `agent/request-error` waterfall; a failed request is retried (default "normal" mode: 2 retries on `EMPTY_RESPONSE`/`RATE_LIMIT`/`SERVER`/`TIMEOUT`/`TRANSPORT`, 500 ms → 10 s backoff + 10 % jitter), each attempt logged as durable `llm/retry` / `llm/retry-started` session events |
| `dsh-invariants` | auditing | `ctx.invariants` registry; per-package companions (`@deepseek-ai/<pkg>/invariant`) attach runtime checks over the durable session log — e.g. retry events must name the open turn, todo snapshots must be well-formed |
| `dsh-session-telemetry` | observing | the `SessionTelemetrySink` seam: a backend receives redacted copies of session records (live or replayed); batching/delivery belong to the backend SDK |
| `dsh-session-projection` | measuring (plumbing) | the `ctx.sessionProjections` registry that folds per-session projection units from the durable log and serves them to consumers |
| `dsh-session-stats` | measuring | folds the whole session log into renderable figures: turns, steps, llmMs, ttftMs, decodeMs, toolMs |

Retry policy is not configured on the executor (`dsh-llm-retry` has an
empty config schema) — it lives in the provider profile's optional
`retryPolicy` key.  The frozen provider entry omits it, so **normal mode
applies by default**: mounting the plugin alone turns retry on.

`dsh-session-projection` is mounted in L10 because its first consumer in
this composition is `dsh-session-stats`.  A nice side effect: several
earlier plugins declare an *optional* dependency on the registry
(`ctx.inject(['sessionProjections'], …)`), so mounting it retroactively
activates their projection units too — a live boot of this stage shows
`sessionStats, todos, plan, goal, subagentTiming, subagent, tokenUsage,
contextPressure, contextBreakdown, permissions` all folding from the log.

## Run

```sh
# Same fix-the-bug task as earlier stages — watch the trace, not the answer
qa-minimal 10 --trace "Fix the divide-by-zero bug in src/calculator.js and run the tests"

# Resume still works — llm/retry events are durable log entries,
# so they survive the restart too
qa-minimal 10 --resume <session-id> "continue"
```

> Stages 3+ run in a disposable temp workspace, so fixture files and bash
> side effects never pollute the repo.

## What you see

Against a flaky gateway (or the smoke-test dead `baseURL`, which
classifies as `TRANSPORT`), the trace gains retry events around the same
turn/step machinery:

```
  [trace] turn/start
  [trace] step/start
  [trace] request/header
  [trace] llm/retry            ← attempt failed (TRANSPORT); backoff scheduled
  [trace] llm/retry-started    ← backoff elapsed, retrying the same request
  [trace] llm/retry            ← second failure; normal-mode budget exhausted
  [trace] step/end
  [trace] turn/end             ← the error surfaces to the driver
```

While this happens, the projection registry folds each event live: the
`sessionStats` unit counts the step, and the LLM wall time keeps accruing
across retries (retry waits are model time).  A healthy run additionally
shows the accumulated L7–L9 vocabulary — `todo/write` snapshots,
`goal/change`, `subagent/*` lifecycle — none of which existed in the L6
trace.

## Gaps (documented, not silently dropped)

Earlier stages' module gaps are all closed at this level: `dsh-plan-mode`,
`dsh-workspace` (via the `dsh-storage` → `dsh-storage-sqlite` →
`dsh-storage-domain` chain, mounted in the L7 section), the in-process
subagent providers (`dsh-subagent-in-process-driver` is a pure library —
nothing to mount, it just makes them importable), `dsh-tool-jobs`, and
the concrete workflow engine `dsh-workflow-worker-thread` are all
**enabled**.

What remains is deliberate seam bookkeeping — entries kept visible in
`inspect`/`diff`, mounted `disabled: true`:

- **`dsh-session-telemetry`** — still a pure Service Definition (exports
  only the abstract `SessionTelemetryBackend` + coordinator, no plugin
  entry); cordis rejects it as "invalid plugin".  Needs a backend package
  (e.g. an OTel implementation), which is not installed.
- **`dsh-jobs`** — abstract seam; its constructor throws by design
  ("load an implementation such as dsh-jobs-local").  `dsh-jobs-local`
  carries the runtime.
- **`dsh-compaction`** / **`dsh-workflow`** — abstract seams that no longer
  mount even inertly: their concrete providers (`dsh-compaction-basic`,
  `dsh-workflow-worker-thread`) are now enabled, and co-mounting both
  would double-register `ctx.compaction` / `ctx.workflowEngine` and crash.
  Exactly one implementation per context.

Every other plugin activates: a boot probe shows `sessionProjections`,
`storageDomain`, `userQuestions`, `invariants`, `WorkerThreadWorkflowEngine`,
`LocalJobRegistry`, and both `spawn`/`fork` subagent providers all live.

## The L6 → L10 progression

Same frozen persona, same tools, same task.  What changed is everything
*around* the run:

| Stage | Question it answers |
|---|---|
| L6 | "may the agent do this?" (approval) |
| L7 | "what is the agent doing?" (todo/plan/goal state) |
| L8 | "who is doing it?" (subagents, jobs) |
| L9 | "how long can it keep doing it?" (workflow, compaction) |
| L10 | "what happens when it breaks — and can we prove it worked?" (retry, telemetry, stats, invariants) |
