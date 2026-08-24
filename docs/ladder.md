# The Ladder

Each level = one minimal runnable capability closure. Not "one plugin at a time"
— plugins have dependencies. Each level adds the *smallest set* that produces a
new observable behavior. Every level strictly satisfies **L(n) ⊇ L(n-1)**:
upper levels inherit all plugins from lower levels and add one new closure.

## Growth tree

```
                         Full Harness
                              ▲
                    Workflow / Subagent
                              ▲
                     Plan / Goal / Skill
                              ▲
              Approval / Permission
                              ▲
                  Sandbox Enforcement
                              ▲
                   Shell / Process
                              ▲
                     Workspace FS
                              ▲
                   Session Persistence
                              ▲
                         Agent Loop
                              ▲
                   LLM + Adapter + Driver
                              ▲
                         qa-minimal
```

## Levels

| Level | Name | New capability closure | Observable change | Architecture concept |
|---|---|---|---|---|
| **L0** | Raw LLM | dsh-llm + adapter + driver | ask → answer → exit | `ctx.llm` is just a service |
| **L1** | Agent | session + system-prompt + tools + agent + agent-loop | same Q&A, but with turn/step/session | **LLM ≠ Agent** |
| **L2** | Persistent Agent | session-persistence-jsonl + checkpoint-policy | exit, restart, resume | memory is a seam, not in the loop |
| **L3** | Workspace FS | fs service + local provider + read/write/edit tools | "read this project" actually reads/writes files | Definition + Provider + Consumer (Cordis DI) |
| **L4** | Shell / Process | subprocess + shell + bash provider + bash tool + fs-search | runs tests, edits files, searches with glob/grep | real side effects (process execution) |
| **L5** | Sandboxed Agent | sandbox-local + sandbox-policy + fs-sandbox + bash-sandbox | same command, now denied outside workspace | capability ⊥ permission (enforcement) |
| **L6** | Approval & Permission | user-approval + permission-presets | denied → escalate → asks approval → allowed-once | capability ⊥ permission (escalation) |
| **L7** | Stateful Task Agent | todo + plan + goal + workspace context | plans, tracks tasks, reads AGENTS.md | prompt + state + tools are all plugins |
| **L8** | Multi-Agent | subagent + jobs | spawn/fork, parallel work | Agent as a provider |
| **L9** | Workflow Agent | workflow + ralph + compaction + guard | long multi-round tasks | conversation → task runtime |
| **L10** | Operable Harness | retry + invariants + telemetry + stats | retry, diagnose, measure | "runs" ≠ "operable" |
| **L11** | Productized | settings + credentials + preset + bundle + HMR | hot-swap model/key/mode | composition → product config |
| **L12** | Full Product | host + API + client + Web UI | CLI → API → Web | one capability graph, many entry points |

> Status: L0–L11 implemented (`stages/00`–`stages/11`). L12 (host/API/Web
> surfaces) lives in the full `dsh` CLI and is out of this lab's scope.

## The behavior outcome matrix

Every level runs the same seven tasks (A–G). What changes is the **behavior
outcome** — not a simple pass/fail, because "denied by sandbox" and "asks
approval" are correct results, not failures. This separates *capability*
from *policy*.

| Task | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A. Answer a knowledge question | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds |
| B. Remember this turn's info | unsupported | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds |
| C. Resume after restart | unsupported | unsupported | persists | persists | persists | persists | persists | persists | persists | persists | persists | persists |
| D. Read a project file | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds |
| E. Run tests and edit files | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds |
| F. Write outside workspace | unsupported | unsupported | unsupported | unsupported | succeeds | denied-by-sandbox | asks-approval | asks-approval | asks-approval | asks-approval | asks-approval | asks-approval |
| G. Track multi-step work (todo/plan/goal) | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds | succeeds | succeeds |
| H. Delegate to a sub-agent | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds | succeeds |
| I. Long-running task (ralph/compaction) | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds |
| J. Retry transient failure + stats | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds |

### Reading the matrix

- **succeeds** — the agent has the capability and no policy blocks it
- **persists** — the agent survives process restart (persistence seam)
- **denied-by-sandbox** — the sandbox silently rejects an out-of-boundary
  operation; this is the **correct** result for L5, not a failure
- **asks-approval** — the sandbox denies, the model escalates with
  justification, and the approval gate prompts the user; this is the
  **correct** result for L6
- **unsupported** — the capability closure is not yet mounted

This "same task, different plugin graph" experience proves:
**Agent capability is not hardcoded — it is composed. And capability is
orthogonal to policy — the same tool can succeed, be denied, or ask
approval depending on which safety plugins are mounted.**