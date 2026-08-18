# Stage 01 — First Agent

The most important conceptual jump in the entire lab: **LLM ≠ Agent**.

Same model, same gateway, same question as Stage 00. But now the call goes
through the full Agent spine: `session → system-prompt → tools → agent → agent-loop`.

## What changed from Stage 00

```diff
  @deepseek-ai/dsh-llm              # already here
  @deepseek-ai/dsh-llm-pi-ai        # already here
+ @deepseek-ai/dsh-session           # event-sourced session log
+ @deepseek-ai/dsh-system-prompt     # prompt assembly (persona)
+ @deepseek-ai/dsh-tools            # tool registry (empty — zero tools)
+ @deepseek-ai/dsh-agent            # agent registry + AgentFactory slot
+ @deepseek-ai/dsh-agent-loop       # THE loop: drives turns, writes session log
```

`dsh-tools` is mounted but registers zero tools. The model cannot call tools.
This is deliberate — the lesson is "what makes it an Agent" is the loop machinery
(turn, step, session), not tool-calling.

## Run

```sh
qa-minimal 1 "解释 CAP 定理"
qa-minimal 1 --trace "解释 CAP 定理"
```

## What you see

Without trace: same answer as Stage 00, but now with a session id at the bottom.

With `--trace`: the event stream that Stage 00 completely lacks:

```
  [trace] session/created
  [trace] turn/start
  [trace] agent/request
  [trace] assistant/message
  [trace] turn/end
  [trace] agent ready · session qa-xxxxxxxx
<answer>
── session: qa-xxxxxxxx ──
```

Compare with `qa-minimal 0 --trace "..."` which prints **nothing** — no session,
no turns, no steps. That silence IS the lesson.

## The diff that teaches

```diff
  # Stage 00: raw LLM call
- ctx.llm.stream({ provider, model, messages })

  # Stage 01: Agent loop
+ const { agent } = await ctx.agents.create({ agentOptions: { provider, model } })
+ agent.followup(createUserMessage({ ... }))
+ await agent.whenIdle()
```

The `ctx.llm.stream()` call is still happening — inside the loop, on every turn.
But now it's wrapped in a session, bounded by turn/step, and logged for replay.