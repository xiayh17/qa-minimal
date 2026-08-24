# Stage 08 — Multi-Agent

The same sandboxed, approval-gated, stateful agent as the stages before — but
now it can **delegate**.  The subagent seam lets the model hand a task to a
child agent and receive back only the child's final message.

L8 = L7 + Delegation.  Because Stage 07 may still be growing in parallel,
this stage mounts both closures on top of Stage 06: the five stateful-task
plugins (L7) and the six multi-agent packages (L8).

## What changed from Stage 06

```diff
  (all Stage 06 plugins — sandbox + approval + FS + shell + search + persistence are inherited)
+ @deepseek-ai/dsh-tool-todo                  todo_write: whole-list task tracking
+ @deepseek-ai/dsh-user-questions             user-questions seam (ctx.userQuestions) for the plan review
+ @deepseek-ai/dsh-plan-mode                  plan/mode state + exit_plan_mode review
+ @deepseek-ai/dsh-goal                       event-sourced goal domain (ctx.goals)
+ @deepseek-ai/dsh-tool-goal                  get_goal / create_goal / update_goal
+ @deepseek-ai/dsh-storage                    storage hub (ctx.storage) — backend registry
+ @deepseek-ai/dsh-storage-sqlite             SQLite backend, registered as "sqlite"
+ @deepseek-ai/dsh-storage-domain             domain data form, provides ctx.storageDomain
+ @deepseek-ai/dsh-workspace                  workspace registry (ctx.workspaceRegistry)
+ @deepseek-ai/dsh-subagent                   subagent registry (ctx.subagents) — process singleton
+ @deepseek-ai/dsh-subagent-spawn-in-process  provider "spawn": fresh child, no parent history
+ @deepseek-ai/dsh-subagent-fork-in-process   provider "fork": child inherits completed parent turns
+ @deepseek-ai/dsh-tool-subagent              `subagent` + `subagent_fork` delegation tools (two instances)
+ @deepseek-ai/dsh-jobs                       abstract job-registry seam (listed disabled — see below)
+ @deepseek-ai/dsh-jobs-local                 process-local ctx.jobs implementation
+ @deepseek-ai/dsh-tool-jobs                  job_list / job_output / job_kill + completion notices
```

## Architecture concept: Agent as a provider

```text
Service Definition   dsh-subagent          ctx.subagents — one registry per process
       ├── Provider  dsh-subagent-spawn-in-process   "spawn": fresh child Agent
       ├── Provider  dsh-subagent-fork-in-process    "fork":  history-seeded child
       └── Consumer  dsh-tool-subagent                `subagent` / `subagent_fork` tools
```

This is the same Definition → Provider → Consumer pattern as the FS seam
(Stage 03), one level up: **the thing being provided is an Agent itself.**
The registry is a process singleton; providers decide *how* the child runs
(fresh vs. history-seeded), and the delegation tool decides *that* the model
can ask for one.  Swapping a provider changes transport without changing the
execution contract — one tool instance binds one provider to one tool name,
so this stage mounts `dsh-tool-subagent` twice.

Delegated children run inside the parent's sandbox and approval scope, fixed
at the delegation boundary: the child's approval policy is pinned to `never`,
so a delegated escalation is rejected deterministically instead of waiting on
a prompt nobody is watching.

## Run

```sh
# Delegate the fixture bug investigation to a subagent (default question)
qa-minimal 8
qa-minimal 8 --trace

# Explicit variant: the fork provider lets the child see completed parent turns
qa-minimal 8 --trace 'Use subagent_fork to have a child continue the investigation of src/calculator.js, then compare its report with your own reading of the file.'
```

> Stages 3+ run in a disposable temp workspace; the child agent inherits the
> parent's cwd and works on the same throwaway copy of `fixtures/demo-project`.

## What you see

With `--trace`, a foreground delegation shows the child's own session events
nested inside the parent's turn — and only the final message comes back:

```
  [trace] tool/call              ← parent calls subagent: "read src/calculator.js, find the bug"
  [trace] turn/start             ← the CHILD's session starts its own turn
  [trace] tool/call              ← child reads src/calculator.js
  [trace] tool/result
  [trace] assistant/message      ← child's report (stays in the child's session)
  [trace] turn/end
  [trace] tool/result            ← parent receives ONLY the child's final message
  [trace] assistant/message      ← "The subagent found that divide() does not guard b === 0…"
```

The child's intermediate steps never enter the parent's history — delegation
is context isolation, not just parallelism.

A background delegation (`run_in_background: true`) instead returns
`started background subagent job <id>` immediately; the model then collects
it through the generic job surface (`job_output` / `job_kill`) that
`dsh-tool-jobs` registers, and a completion notice arrives when the run
settles.

## Known gaps in this closure

One structural note survives — everything else from the first draft of this
stage (missing peer packages for the providers, plan mode, and the workspace
registry; no job-control surface) was closed by installing
`dsh-subagent-in-process-driver`, `dsh-user-questions`, the
`dsh-storage` / `dsh-storage-domain` / `dsh-storage-sqlite` chain, and
`dsh-tool-jobs`:

- **`dsh-jobs` is abstract by design.**  Its constructor throws ("load an
  implementation such as dsh-jobs-local instead") when mounted directly, so
  `cordis.yml` lists it `disabled: true`.  `dsh-jobs-local` provides the
  working `ctx.jobs`.

Headless caveat: `ctx.userQuestions` has no UI provider in this CLI, so an
`exit_plan_mode` review cannot actually be answered — the same headless
posture Stage 06 documented for the approval gate.

## The L4 → L5 → L6 → L8 progression

Same model, same tools, **same persona** (byte-for-byte frozen from L4
onward).  Through L6 the safety layers changed while the agent stayed single;
L8 changes the topology instead — one agent becomes a tree of agents, and
task G (delegate to a sub-agent) flips from `unsupported` to `succeeds`.
