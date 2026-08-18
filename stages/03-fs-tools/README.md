# Stage 03 — Workspace Reader

The first real tool. The model can now **read files** — not guess about them.

## What changed from Stage 01

```diff
  (all Stage 01 plugins)
+ @deepseek-ai/dsh-fs-local             Provider: implements ctx.fs
+ @deepseek-ai/dsh-fs-observation-policy  tracks observed files
+ @deepseek-ai/dsh-tool-fs              Consumer: read_file / write_file tool schemas
```

## The capability seam

```
Service Definition  (dsh-fs — the abstract ctx.fs interface, in root closure)
       ├── Provider   (dsh-fs-local — gives ctx.fs a real filesystem backend)
       └── Consumer   (dsh-tool-fs — registers read_file/write_file in the tool registry)
```

Adding only the Provider: `ctx.fs` works, but the model has no tool to call it.
Adding only the Consumer: the model sees a read_file tool, but nothing executes it.
**Both together** = the model can read files. This is the seam pattern.

## Run

```sh
qa-minimal 3 "Read fixtures/demo-project/src/calculator.js and explain what it does"
qa-minimal 3 --trace "Read fixtures/demo-project/src/calculator.js and explain what it does"
```

## What you see

With `--trace`, the event stream now includes tool-call events:

```
  [trace] turn/start
  [trace] step/start
  [trace] tool/call              ← the model decided to call read_file
  [trace] tool/result            ← the FS provider returned the file content
  [trace] step/end
  [trace] step/start             ← next step: the model answers using the file content
  [trace] assistant/message
  [trace] turn/end
```

Compare with Stage 01: no `tool/call` events because there were no tools to call.
The model in Stage 01 could only guess; the model in Stage 03 can **see**.