# Stage 07 — Stateful Task Agent

The same sandboxed, approval-gated agent as Stage 06, but it now owns
**stateful task seams**: a todo list, plan mode, a same-session goal, and a
durable workspace registry.  None of these is hardcoded in the agent loop —
each one is a plugin that hangs durable state on the session event log (or,
for workspaces, on a storage backend), and the model reads and writes that
state through ordinary tool calls.

L7 = L6 + Stateful Task Seams.  Every capability from Stage 06 is still
here — sandbox, approval, FS, shell, search, persistence, resume — plus
the todo, plan-mode, goal, and workspace plugins with their support seams.

## What changed from Stage 06

```diff
  (all Stage 06 plugins — sandbox + approval + FS + shell + search + persistence are inherited)
+ @deepseek-ai/dsh-user-questions   ctx.userQuestions seam (backs the plan-mode review)
+ @deepseek-ai/dsh-tool-todo        todo_write tool; each call appends a durable todo/write event
+ @deepseek-ai/dsh-plan-mode        plan/mode session state + exit_plan_mode tool
+ @deepseek-ai/dsh-goal             ctx.goals: event-sourced goal domain (goal/change events)
+ @deepseek-ai/dsh-tool-goal        get_goal / create_goal / update_goal + goal policy prompt
+ @deepseek-ai/dsh-storage          ctx.storage hub service
+ @deepseek-ai/dsh-storage-sqlite   "sqlite" backend (node:sqlite), db at ./sessions/workspace.db
+ @deepseek-ai/dsh-storage-domain   ctx.storageDomain: domain data form routed to sqlite
+ @deepseek-ai/dsh-workspace        ctx.workspaceRegistry: durable workspace records + session index
```

## prompt + state + tools are all plugins

The architecture concept of this stage: the todo list, the plan-mode flag,
and the goal are **state seams on the session event log**, not fields in
the agent loop.

- `todo_write(todos)` replaces the WHOLE list on every call and appends a
  `todo/write` event; the current list is the most recent such event
  (last-write-wins on replay).  `allowParallelInProgress: true` permits
  several `in_progress` tasks at once — the same deployment choice as the
  other stages in this repo.
- `dsh-plan-mode` keeps a durable `plan/mode` flag (`{ active }`) in the
  log and always registers the `exit_plan_mode` tool: leaving plan mode
  requires the model to present the complete plan and pass a user review
  asked through `ctx.userQuestions`.  Plan mode is **soft guidance** —
  sandbox mode and approval policy enforce restrictions independently and
  never read plan state.
- `ctx.goals` keeps at most one current completion objective.  Every
  mutation appends a durable `goal/change` event carrying the full
  post-mutation snapshot; updates use a compare-and-set `{ id, revision }`
  fence, so `get_goal` must be read before `update_goal`.  The session log
  is the only durable authority — `--resume` replays it.
- `dsh-tool-goal` adds a fixed goal-policy section to the system prompt:
  create a goal only for long-running objectives, mark `complete` only
  when actually achieved, and `blocked` only after the same condition
  persists for at least 3 consecutive goal rounds.
- The "execution-time authority checks" on the goal tools are **not** the
  L6 approval gate: they are runtime checks against the AgentRegistry
  (exact live agent, running status, open turn, and a direct-human message
  in the current turn for create/edit/pause/resume).  The approval service
  stays orthogonal — capability ⊥ policy again.

Because the todo/plan/goal seams live on the session log, Stage 02's
`--resume` reconstructs their state for free: replay derives the current
list, the plan-mode flag, and the current goal from the events — nothing
extra to persist.

### The workspace registry is the same idea, one level up

`ctx.workspaceRegistry` is durable host-side state with **no model-facing
surface at all** (no tools, no prompt sections, no session events).  It is
served by a three-plugin storage chain, mounted just above it:

```
dsh-storage          hub service ctx.storage — backends register by name
dsh-storage-sqlite   backend "sqlite": one node:sqlite connection
                     (path: ./sessions/workspace.db — co-located with the
                     JSONL session logs, same disposable-workspace rule)
dsh-storage-domain   ctx.storageDomain: opens declared domains over the
                     named backend (backend: sqlite)
```

`dsh-workspace` injects `[storageDomain, sessionPersistence]`: on first
start it groups historical sessions by their header `cwd` into workspace
records and persists registry order through the domain form — the SQLite
file under `./sessions/` is the visible proof that this chain is live.

## Run

```sh
# Default question: fix the divide-by-zero bug while tracking work in todos
qa-minimal 7
qa-minimal 7 --trace

# A long-running objective that warrants a goal
qa-minimal 7 --trace 'Migrate the whole fixture project to ESM, step by step'

# Resume: todo list, plan-mode flag, and goal state replay from the log
qa-minimal 7 --resume <session-id> 'Where were we?'
```

> Stages 3+ run in a disposable temp workspace, so the edits, the SQLite
> db, and the `sessions/` log land in `tmp/qa-<run>/` and never pollute
> the fixture.

## What you see

With `--trace`, the new seams appear as ordinary session events alongside
the L1–L6 stream:

```
  [trace] turn/start
  [trace] step/start
  [trace] tool/call            ← todo_write (full replacement list)
  [trace] todo/write           ← durable state event, appended to the log
  [trace] tool/result          ← "Updated todo list: 3 pending, 0 in progress, 0 completed."
  [trace] tool/call            ← bash / fs tools do the actual work
  [trace] tool/call            ← todo_write again (tasks flip to in_progress / completed)
  [trace] todo/write
  [trace] tool/call            ← create_goal (only for long-running objectives)
  [trace] goal/change          ← durable revision-1 goal snapshot
  [trace] assistant/message
  [trace] turn/end
```

And in the request, the model now sees two extra prompt sections (goal
policy from `dsh-tool-goal`, plan policy from `dsh-plan-mode` while plan
mode is active) and four extra tool schemas (`todo_write`,
`get_goal` / `create_goal` / `update_goal`, `exit_plan_mode`) — all
contributed by plugins.

## Known gaps

- **No user-questions UI provider.**  `dsh-user-questions` is mounted, so
  `ctx.userQuestions` and its `ask()` API exist, but the single active UI
  provider must come from a UI package — none is installed in this repo.
  In this headless lab the `exit_plan_mode` review therefore fails with a
  clear `NO_PROVIDER` error and the session stays in plan mode (the model
  is told to keep planning), instead of hanging forever.
- **No `/plan` slash command.**  `dsh-plan-mode` registers `/plan
  [message]` and `/plan off` only when `ctx.commands` is composed, and
  `@deepseek-ai/dsh-commands` is not mounted in this stage.  Plan state
  can still flip programmatically through `ctx.planMode.set()`, and the
  `exit_plan_mode` tool is registered either way.

## The L6 → L7 step

Same model, same tools, same fixture, **same persona** (byte-for-byte
frozen from L4 onward).  The only difference is that the agent can now
plan and track its own multi-step work — and that planning state is just
more events on the same session log that L2 taught us to persist.
