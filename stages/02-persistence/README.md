# Stage 02 — Persistent Agent

Memory is not inside the loop. It's a separate capability seam.

## What changed from Stage 01

```diff
  (all Stage 01 plugins)
+ @deepseek-ai/dsh-session-persistence-jsonl   writes ./sessions/<id>.jsonl
+ @deepseek-ai/dsh-session-checkpoint-policy    checkpoints before each model request
```

The agent-loop is unchanged. The driver adds one line: `await sessions.flush(agent.session)`.

## The resume experiment

```sh
# Run 1: tell it a fact, then exit
qa-minimal 2 "我的实验编号是 31415，请记住"
# → 好的，我记住了。
# ── session: qa-a1b2c3d4-... ──

# Run 2: resume that session and ask it to recall
qa-minimal 2 --resume qa-a1b2c3d4-... "我的实验编号是多少？"
# → 31415
# ── session: qa-a1b2c3d4-... ──
```

The model in Run 2 has never seen Run 1's conversation in this process.
The recall can only come from the rehydrated JSONL event log.

## What this teaches

```
Stage 01                          Stage 02

Agent Loop                        Agent Loop
   │                                 │
Session                            Session
   │                                 │
 memory only                    Persistence seam
 (dies with process)                 │
                                 JSONL Provider
                                      │
                                 session.jsonl
                                 (survives process exit)
```

Swap the JSONL provider for SQLite and the loop never notices.
That's the capability-seam pattern: the loop depends on the Session
*service*, not on any specific storage backend.