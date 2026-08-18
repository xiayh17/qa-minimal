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
| `dsh-session-query-sqlite` | SQLite full-text search (opt-in) |

## Filesystem (Definition + Provider + Consumer)

| Package | Role |
|---|---|
| `dsh-fs-sandbox` / `dsh-fs-local` | Provider: implements `ctx.fs` |
| `dsh-fs-observation-policy` | policy: observed-file tracking |
| `dsh-tool-fs` | Consumer: `read_file` / `write_file` tool schemas |
| `dsh-tool-fs-search` | Consumer: `file_search` tool schema |

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
| `dsh-user-approval` | approval gate |
| `dsh-permission-presets` | permission preset switcher |

## Delegation

| Package | Role |
|---|---|
| `dsh-subagent` | subagent registry (process singleton) |
| `dsh-subagent-spawn-in-process` | spawn backend (fresh child) |
| `dsh-subagent-fork-in-process` | fork backend (inherits history) |
| `dsh-tool-subagent` | Consumer: `subagent` / `subagent_fork` tools |

## Context management

| Package | Role |
|---|---|
| `dsh-token-meter` | token counting + context projection |
| `dsh-compaction-basic` | conversation compaction |
| `dsh-compaction-tool-result-pruner` | oversized tool-result pruning |

## The seam pattern

```
Service Definition  (the abstract interface — e.g. ctx.llm, ctx.fs, ctx.shell)
       ├── Provider  (a concrete backend — e.g. dsh-llm-deepseek, dsh-fs-local)
       └── Consumer  (a tool that uses the service — e.g. dsh-tool-fs, dsh-tool-bash)
```

Adding a Provider alone gives the service a backend but the model can't call it.
Adding a Consumer alone gives the model a tool schema but nothing executes it.
Both together form a capability. This is why Stage 03 (FS) adds THREE plugins,
not one.