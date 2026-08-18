# Stage 04 — Coding Agent

The Agent can now **run commands**. Read files, edit them, run tests, commit.
This is where "Q&A" becomes "coding agent": the model has real side effects.

## What changed from Stage 03

```diff
  (all Stage 03 plugins)
+ @deepseek-ai/dsh-subprocess-local   Provider: child-process groups
+ @deepseek-ai/dsh-shell-env          shell environment variables
+ @deepseek-ai/dsh-bash-local         Provider: implements ctx.shell (real bash)
+ @deepseek-ai/dsh-tool-bash          Consumer: bash tool schema
```

Same seam pattern as Stage 03, now for shell:
```
dsh-shell (abstract) → dsh-bash-local (Provider) + dsh-tool-bash (Consumer) = bash capability
```

## Run

```sh
qa-minimal 4 "Read fixtures/demo-project/src/calculator.js, fix the divide-by-zero bug, and verify"
qa-minimal 4 --trace "..."
```

## What you see

With `--trace`, the event stream now includes bash tool calls:

```
  [trace] tool/call              ← read_file
  [trace] tool/result
  [trace] tool/call              ← bash (sed to fix the bug)
  [trace] tool/result            ← [exit code: 0]
  [trace] tool/call              ← bash (node -e to verify)
  [trace] tool/result            ← Division by zero
  [trace] assistant/message      ← "I fixed the bug and verified..."
```

The model read a file, edited it, ran a test, and reported the result.
**This is a coding agent.** But note: there is no sandbox — the model can
write anywhere, run any command. Stage 05 adds the safety layer.