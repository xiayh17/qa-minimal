# Stage 04 — Shell / Process Execution

The Agent can now **run commands**. Read files, edit them, run tests, search
with glob/grep.  Up to L3 the model could only operate on files; now it can
start real programs and see stdout/stderr/exit codes.  This is where "Q&A"
becomes "coding agent": the model has real side effects.

L4 = L3 + Shell.  Every capability from Stage 03 is still here — FS tools,
persistence, resume — plus the Shell capability seam.

## What changed from Stage 03

```diff
  (all Stage 03 plugins — FS + persistence are inherited)
+ @deepseek-ai/dsh-subprocess-local   Provider: child-process groups
+ @deepseek-ai/dsh-shell-env           shell environment variables
+ @deepseek-ai/dsh-bash-local          Provider: implements ctx.shell (real bash)
+ @deepseek-ai/dsh-tool-bash           Consumer: bash tool schema
+ @deepseek-ai/dsh-tool-fs-search      Consumer: glob / grep tool schemas
```

Same seam pattern as Stage 03, now for shell:
```
dsh-shell (abstract) → dsh-bash-local (Provider) + dsh-tool-bash (Consumer) = bash capability
```

Search tools (`glob`, `grep`) are a separate Consumer that depends on
`ctx.subprocess` — which is why they arrive here in L4, not in L3.

## Model-visible tools

| Tool | Source | New in L4? |
|---|---|---|
| `read` | dsh-tool-fs (inherited) | |
| `write` | dsh-tool-fs (inherited) | |
| `edit` | dsh-tool-fs (inherited) | |
| `glob` | dsh-tool-fs-search | ✦ |
| `grep` | dsh-tool-fs-search | ✦ |
| `bash` | dsh-tool-bash | ✦ |

## Run

```sh
qa-minimal 4 "Read src/calculator.js, fix the divide-by-zero bug, and verify"
qa-minimal 4 --trace "..."
```

> Stages 3+ run in a disposable temp workspace.  File edits and the
> out-of-workspace write (`../outside.txt`) land in `tmp/qa-<run>/` and
> are cleaned up automatically.  You can run 100 times and get the same
> result.

## What you see

With `--trace`, the event stream now includes bash tool calls:

```
  [trace] tool/call              ← read
  [trace] tool/result
  [trace] tool/call              ← bash (sed to fix the bug)
  [trace] tool/result            ← [exit code: 0]
  [trace] tool/call              ← bash (node -e to verify)
  [trace] tool/result            ← Division by zero
  [trace] assistant/message      ← "I fixed the bug and verified..."
```

The model read a file, edited it, ran a test, and reported the result.
**This is a coding agent.** But note: there is no sandbox — the model can
write anywhere, run any command. Stage 05 adds the sandbox layer.

## The A/B experiment setup

The persona is **frozen** from L4 onward (L4 → L5 → L6) so that the
L4→L5 A/B comparison is truly single-variable.  Only the safety plugins
change; the system prompt is byte-for-byte identical.