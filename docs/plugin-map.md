# Plugin Map

How DeepSeek Harness organizes its capability packages. Each group is a
capability seam: Service Definition → Provider → Consumer.

## Core spine (the Agent)

| Package | Service | Role |
|---|---|---|
| `dsh-llm` | `ctx.llm` | LLM registry + content-block vocabulary |
| `dsh-session` | `ctx.sessions` | event-sourced session log + store |
| `dsh-system-prompt` | `ctx.systemPrompt` | prompt-section + tool-schema assembly |
| `dsh-tools` | `ctx.tools` | tool registry + guarded execution pipeline |
| `dsh-agent` | `ctx.agents` | agent registry + AgentFactory slot |
| `dsh-agent-loop` | (factory) | THE concrete loop — drives turns, writes log |

## LLM adapters (providers on `ctx.llm`)

| Package | Protocol | Route |
|---|---|---|
| `dsh-llm-deepseek` | DeepSeek chat-completions | `deepseek-official` |
| `dsh-llm-pi-ai` | multi-protocol (OpenAI, Anthropic, ...) | per `providers` config |

## Session persistence (providers on session seam)

| Package | Backend |
|---|---|
| `dsh-session-persistence-jsonl` | append-only JSONL file |
| `dsh-session-persistence-sqlite` | SQLite event store (opt-in) |

## Session query / search (separate capability family)

| Package | Role |
|---|---|
| `dsh-session-query` | ABSTRACT retrieval seam (`ctx.sessionQuery`; listed disabled) |
| `dsh-session-query-sqlite` | Provider: SQLite FTS5 index over session history |
| `dsh-session-reference` | Consumer: cross-session snapshot references as durable (untrusted) model context |

> `session-query` is NOT a persistence backend — it is a retrieval capability
> that sits on top of whichever persistence backend is mounted (here it
> watches the JSONL store).

## Filesystem (Definition + Provider + Consumer)

| Package | Role |
|---|---|
| `dsh-fs-sandbox` / `dsh-fs-local` | Provider: implements `ctx.fs` |
| `dsh-fs-observation-policy` | policy: observed-file tracking |
| `dsh-tool-fs` | Consumer: `read` / `write` / `edit` tool schemas |
| `dsh-tool-fs-search` | Consumer: `glob` / `grep` tool schemas (depends on `ctx.subprocess`) |
| `dsh-tool-str-replace-editor` | Consumer: `str_replace_editor` surgical edits over `ctx.fs` (routes through sandbox + approval) |

## Shell (Definition + Provider + Consumer)

| Package | Role |
|---|---|
| `dsh-bash-local` / `dsh-bash-sandbox` | Provider: implements `ctx.shell` |
| `dsh-subprocess-local` | Provider: child-process groups |
| `dsh-tool-bash` | Consumer: `bash` tool schema |

## Safety (orthogonal to capability)

| Package | Role |
|---|---|
| `dsh-sandbox-local` | sandbox boundary |
| `dsh-sandbox-policy` | read-only / workspace-write / danger-full-access |
| `dsh-user-approval` | approval gate (policy: `never` = deny before asking; `ask` = prompt user) |
| `dsh-permission-presets` | combines `sandbox/mode` + `approval/policy` into user-selectable presets |

> `dsh-user-approval` with `policy: never` does NOT auto-allow — it denies
> the request *before* it reaches interactive approval. This is the L5
> behavior (sandbox enforcement only). `policy: ask` triggers the approval
> prompt — this is the L6 behavior.

## Delegation

| Package | Role |
|---|---|
| `dsh-subagent` | subagent registry (process singleton) |
| `dsh-subagent-spawn-in-process` | spawn backend (fresh child) |
| `dsh-subagent-fork-in-process` | fork backend (inherits history) |
| `dsh-tool-subagent` | Consumer: `subagent` / `subagent_fork` tools |
| `dsh-jobs` | ABSTRACT background-job seam (constructor throws by design) |
| `dsh-jobs-local` | Provider: process-local `ctx.jobs` |
| `dsh-tool-jobs` | Consumer: `job_list` / `job_output` / `job_kill` |
| `dsh-tool-subagent-control` | Consumer: parent→child `send_message` / `interrupt_agent` (registered once, global) |
| `dsh-tool-subagent-control/list-agents` | Consumer: `list_agents` discovery (subpath export; calls need `ctx.sessionProjections`) |
| `dsh-tool-subagent-report` | child→parent `report` tool, exists only inside continuable in-process children |

> Both spawn/fork providers import `dsh-subagent-in-process-driver`, a pure
> library (not a mountable plugin). `dsh-tool-subagent` binds one provider to
> one tool name per instance — mount it twice to expose both transports.

## Task state (todo / plan / goal / workspace)

| Package | Role |
|---|---|
| `dsh-tool-todo` | Consumer: `todo_write` over the session event log |
| `dsh-plan-mode` | per-agent plan mode + `exit_plan_mode` review flow |
| `dsh-user-questions` | seam: `ctx.userQuestions` (headless → `NO_PROVIDER`) |
| `dsh-goal` | Service: event-sourced same-session goal state |
| `dsh-tool-goal` | Consumer: `create_goal` / `get_goal` / `update_goal` |
| `dsh-storage` | hub: `ctx.storage` named-backend registry |
| `dsh-storage-sqlite` | Provider: SQLite backend (`node:sqlite`) |
| `dsh-storage-domain` | Provider: domain data-form routing (`ctx.storageDomain`) |
| `dsh-workspace` | workspace entity registry (`ctx.workspaceRegistry`) |
| `dsh-goal-round-driver` | runtime: continues an armed goal as sequential `<goal_round>` prompts at idle |
| `dsh-agent-instructions` | AGENTS.md / CLAUDE.md chain folded into durable history |
| `dsh-schedule` | Consumer: `schedule_create` / `schedule_list` / `schedule_delete` durable reminders |

## Skill

| Package | Role |
|---|---|
| `dsh-skill` | seam: `ctx.skills`, a scope-layered registry of named skill providers |
| `dsh-skill-filesystem` | Provider: scans project + user roots for `SKILL.md` bundles and flat `.md` files (chokidar watch) |
| `dsh-tool-skill` | Consumer: `<available_skills>` catalog message + `skill` loader tool |
| `dsh-skill-badge` | optional bundled Provider (fixed `dsh-badge` skill; ships disabled) |

> Same Definition → Provider → Consumer shape as `ctx.subagents`: the seam
> owns no skill source and renders no model-facing surface itself.

## Workflow / context management

| Package | Role |
|---|---|
| `dsh-workflow` | ABSTRACT workflow seam (`ctx.workflowEngine`) |
| `dsh-workflow-worker-thread` | Provider: worker-thread engine |
| `dsh-tool-ralph` | Consumer: fresh-agent ralph loop |
| `dsh-tool-workflow` | Consumer: model-written JS orchestration scripts on `ctx.workflowEngine` |
| `dsh-token-meter` | token counting + context projection |
| `dsh-compaction` | ABSTRACT compaction seam |
| `dsh-compaction-basic` | Provider: token-meter-driven LLM summarization |
| `dsh-compaction-tool-result-pruner` | oversized tool-result pruning |
| `dsh-code-runtime` | ABSTRACT code-runtime seam (`ctx.codeRuntime`; listed disabled) |
| `dsh-code-runtime-worker-thread` | Provider: one fresh Node worker thread per program (containment, not a security boundary) |

> Abstract seams (`dsh-jobs`, `dsh-compaction`, `dsh-workflow`,
> `dsh-code-runtime`, `dsh-session-query`) register the same service name as
> their concrete provider — mount exactly one implementation, list the
> abstract entry disabled for visibility.

> Mounting the code-runtime provider alone does NOT change the model's tool
> surface: the consumer is `dsh-tools`' Code Mode (`run_code`), gated by the
> tools config `mode` field.

## Operability

| Package | Role |
|---|---|
| `dsh-llm-retry` | retry policy hook (`llm/retry` events; policy lives under each LLM provider's config) |
| `dsh-invariants` | runtime assertion registry |
| `dsh-session-projection` | projection registry (activates stats + todo/plan/goal projections) |
| `dsh-session-stats` | session statistics unit |
| `dsh-session-telemetry` | contract-only seam (needs a backend, e.g. OTel) |
| `dsh-repeat-tool-reminder` | advisory loop-breaker: escalating reminder after N identical consecutive calls |
| `dsh-tool-call-timeout-policy` | cooperative per-call budget (structured `TOOL_TIMEOUT` result) |
| `dsh-time-context` | per-step zoned timestamp + elapsed-time context messages |

## Product config

| Package | Role |
|---|---|
| `dsh-settings` | ABSTRACT settings seam (`ctx.settings`) |
| `dsh-settings-file` | Provider: YAML file + watch hot-reload |
| `dsh-credentials` | ABSTRACT credentials seam (`ctx.credentials`) |
| `dsh-credentials-local` | Provider: env + local YAML credential resolution |
| `dsh-commands` | human-command registry (`ctx.commands`) for slash commands |
| `dsh-command-compact` / `dsh-command-goal` / `dsh-command-feedback` | `/compact`, `/goal`, `/feedback` producers |
| `dsh-tool-ask-user` | Consumer: `ask_user_question` over the `ctx.userQuestions` seam |
| `dsh-session-title` | log-backed session titles (`ctx.sessionTitle`) |
| `dsh-session-title-first-prompt-llm` | first-message LLM title provider (falls back to first-words) |
| `dsh-persona` | scope-only persona section (belongs in an agent preset; disabled globally) |
| `dsh-agent-default-model` | `ctx.agentDefaultModel`: process-wide default provider/model |
| `dsh-agent-tool-presentation` | scope-only native/code tool presentation for agent presets (disabled globally) |

> Preset / bundle / HMR have no standalone npm packages at this version —
> they live in the dsh CLI's `dsh-base` profile bundle.

## Web access

| Package | Role |
|---|---|
| `dsh-web` | `ctx.web` WebRuntime — mounted directly; providers register INTO it (no abstract row) |
| `dsh-web-search-deepseek` | search Provider "deepseek-official": each search is a full auxiliary model turn with the native `web_search_20250305` server tool |
| `dsh-web-fetch-http` | fetch Provider: plain HTTP GET with size / content-type limits |
| `dsh-tool-web` | Consumer: `web_search` / `web_fetch` tool schemas |

> Unlike the abstract seams, `dsh-web` IS the runtime, so all entries mount
> enabled. With one usable provider per kind, selection auto-resolves. Web
> tools bypass the approval gate — no web-specific permission policy exists.

## MCP

| Package | Role |
|---|---|
| `dsh-mcp-client` | bridge: connects to an external MCP server (stdio / streamable-http) and registers its tools on `ctx.tools` as `mcp__<serverName>__<rawName>` |

> One plugin instance bridges one server. The bridge is a Consumer of the
> core `ctx.tools` registry, so external tools are first-class model tools
> with no agent-loop changes. `failOnStartupError: false` (default) degrades:
> zero tools from an unreachable server, bounded retries, agent keeps running.

## The seam pattern

```
Service Definition  (the abstract interface — e.g. ctx.llm, ctx.fs, ctx.shell)
       ├── Provider  (a concrete backend — e.g. dsh-llm-deepseek, dsh-fs-local)
       └── Consumer  (a tool that uses the service — e.g. dsh-tool-fs, dsh-tool-bash)
```

Provider makes the service appear on `ctx` (e.g. `ctx.fs`). Consumer declares
a dependency on that service via `inject`. When the dependency is satisfied,
Consumer activates and registers tool schemas onto `ctx.tools`. Without the
Provider, the Consumer stays pending. Without the Consumer, the service works
but the model has no tool to call it. Both together form a capability.

This is why Stage 03 (FS) adds THREE plugins, not one — and why adding a
Consumer alone (e.g. mounting `dsh-tool-fs` without `dsh-fs-local`) does NOT
give the model a tool: the Consumer waits for `ctx.fs` and never activates.
