# Stage 00 — Raw LLM

The control group. Three plugins, one `ctx.llm.stream()` call, one answer, exit.

There is no Agent here. No session, no turn, no step, no tool, no memory.
Every later stage is this plus one more capability closure.

## Plugins

| plugin | role |
|---|---|
| `@deepseek-ai/dsh-llm` | abstract LLM service (registry + content-block vocabulary) |
| `@deepseek-ai/dsh-llm-pi-ai` | adapter: registers `local-anthropic` route on `ctx.llm` |
| `./driver.mjs` | sends one message, prints the reply, exits |

## Run

```sh
qa-minimal 0 "解释 CAP 定理"
qa-minimal 0 --trace "解释 CAP 定理"    # trace shows: nothing — no session events exist
```

## What you see

```
catalog: deepseek-v4-pro, deepseek-v4-flash
<answer>
── model: deepseek-v4-flash · finish: stop · tokens: 11 in / 53 out ──
```

With `--trace`: silence. No session events fire because there is no session.
This emptiness IS the lesson — L0 is "calling a model", not "running an Agent".