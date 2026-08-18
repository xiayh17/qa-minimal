# The Ladder

Each level = one minimal runnable capability closure. Not "one plugin at a time"
— plugins have dependencies. Each level adds the *smallest set* that produces a
new observable behavior.

## Growth tree

```
                         Full Harness
                              ▲
                    Workflow / Subagent
                              ▲
                     Plan / Goal / Skill
                              ▲
                  Sandbox / Permission
                              ▲
                        Shell / FS
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
| **L3** | Workspace Reader | fs service + local provider + read/search tools | "read this project" actually reads files | Definition + Provider + Consumer |
| **L4** | Coding Agent | subprocess + shell + bash provider + bash tool | runs tests, edits files | real side effects |
| **L5** | Safe Agent | sandbox + approval + permission | same command, now denied/asked | capability ⊥ permission |
| **L6** | Stateful Task Agent | todo + plan + goal + workspace context | plans, tracks tasks, reads AGENTS.md | prompt + state + tools are all plugins |
| **L7** | Multi-Agent | subagent + jobs | spawn/fork, parallel work | Agent as a provider |
| **L8** | Workflow Agent | workflow + ralph + compaction + guard | long multi-round tasks | conversation → task runtime |
| **L9** | Operable Harness | retry + invariants + telemetry + stats | retry, diagnose, measure | "runs" ≠ "operable" |
| **L10** | Productized | settings + credentials + preset + bundle + HMR | hot-swap model/key/mode | composition → product config |
| **L11** | Full Product | host + API + client + Web UI | CLI → API → Web | one capability graph, many entry points |

## The fixed test suite

Every level runs the same six tasks. What changes is which ones pass:

| Task | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 |
|---|---|---|---|---|---|---|---|---|
| A. Answer a knowledge question | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| B. Remember this turn's info | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| C. Resume after restart | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| D. Read a project file | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| E. Run tests and edit files | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| F. Write outside workspace | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| G. Delegate to a sub-agent | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

This "same task, different plugin graph" experience proves:
**Agent capability is not hardcoded — it is composed.**