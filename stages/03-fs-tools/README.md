# Stage 03 — Workspace FS

The first real tool. The model can now **read, write, and edit files** — not
guess about them.  This is a Workspace FS Agent: the model can produce real
file side effects.

L3 = L2 + FS.  Every capability from Stage 02 is still here — the agent can
resume across process restarts — plus the FS capability seam.

## What changed from Stage 02

```diff
  (all Stage 02 plugins — persistence is inherited)
+ @deepseek-ai/dsh-fs-local               Provider: implements ctx.fs
+ @deepseek-ai/dsh-fs-observation-policy   tracks observed files
+ @deepseek-ai/dsh-tool-fs                 Consumer: read / write / edit tools
```

## The capability seam — Cordis dependency injection

```
Service Definition  (dsh-fs — the abstract ctx.fs interface, in root closure)
       ├── Provider   (dsh-fs-local — gives ctx.fs a real filesystem backend)
       └── Consumer   (dsh-tool-fs — declares inject ['tools','fs','systemPrompt'])
```

`dsh-tool-fs` declares `inject = ['tools', 'fs', 'systemPrompt']`.  When no
`ctx.fs` provider is mounted, the Consumer stays pending — it waits for its
dependency.  When `dsh-fs-local` is mounted, `ctx.fs` appears, the dependency
is satisfied, and the Consumer activates: it registers `read / write / edit`
tool schemas onto `ctx.tools`, making them visible to the model.

Adding only the Provider: `ctx.fs` works internally, but the model has no
tool to call it.
Adding only the Consumer: the Consumer waits for `ctx.fs` — it never
activates, so the model never sees the tools.
**Both together** = the model can read and write files. This is the seam
pattern, and it is Cordis's dependency injection made visible.

## Run

```sh
qa-minimal 3 "Read src/calculator.js and explain what it does"
qa-minimal 3 --trace "Read src/calculator.js and explain what it does"
```

> Stages 3+ run in a disposable temp workspace — `fixtures/demo-project` is
> copied to `tmp/qa-<run>/workspace/` so file side effects never pollute the
> git-tracked fixture tree.  You can run 100 times and get the same result.

## What you see

With `--trace`, the event stream now includes tool-call events:

```
  [trace] turn/start
  [trace] step/start
  [trace] tool/call              ← the model decided to call read
  [trace] tool/result            ← the FS provider returned the file content
  [trace] step/end
  [trace] step/start             ← next step: the model answers using the file content
  [trace] assistant/message
  [trace] turn/end
```

Compare with Stage 01: no `tool/call` events because there were no tools to
call. The model in Stage 01 could only guess; the model in Stage 03 can
**see**.

## Model-visible tools

| Tool | Action |
|---|---|
| `read` | Read file contents |
| `write` | Create or overwrite a file |
| `edit` | Apply a targeted text replacement |

Search tools (`glob`, `grep`) are a separate plugin (`dsh-tool-fs-search`)
that depends on `ctx.subprocess` — they arrive in Stage 04.