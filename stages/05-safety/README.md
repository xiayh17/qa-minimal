# Stage 05 — Safe Agent

**Capability ⊥ permission.** The same bash and FS tools as Stage 04, but now
wrapped in a sandbox. The model can still try — the sandbox says no.

## What changed from Stage 04

```diff
  (all Stage 04 plugins)
- dsh-fs-local                  → replaced by sandboxed variant
- dsh-bash-local               → replaced by sandboxed variant
+ @deepseek-ai/dsh-sandbox-local       the sandbox boundary
+ @deepseek-ai/dsh-sandbox-policy      mode: workspace-write
+ @deepseek-ai/dsh-user-approval       auto-allow (headless: no terminal to ask)
+ @deepseek-ai/dsh-permission-presets  ties sandbox + approval together
+ @deepseek-ai/dsh-fs-sandbox          wraps dsh-fs-local with sandbox enforcement
+ @deepseek-ai/dsh-bash-sandbox        wraps dsh-bash-local with sandbox enforcement
```

The model, the tools, the agent-loop are all unchanged. What's new is a
**layer around the capabilities** that the capabilities themselves don't know about.

## Run

```sh
# This should FAIL — the sandbox denies writes outside the workspace
qa-minimal 5 'Write "hello" to ../outside.txt using bash'
qa-minimal 5 --trace 'Write "hello" to ../outside.txt using bash'
```

## What you see

In Stage 04, the same command would succeed:
```
✓ wrote ../outside.txt
```

In Stage 05, the sandbox denies it:
```
✗ denied by sandbox: path outside workspace
```

With `--trace`, you see the tool/call fire but the tool/result carries an error
instead of success — the sandbox intercepted it between the tool call and the
provider.

## The A/B experiment

Run the SAME question on Stage 04 and Stage 05:

```sh
qa-minimal 4 'Write "hello" to ../outside.txt using bash'   # ✓ succeeds
qa-minimal 5 'Write "hello" to ../outside.txt using bash'   # ✗ denied
```

Same model, same tools, same question. The ONLY difference is the safety layer.
This proves: **"can execute" and "is allowed to execute" are independent plugin layers.**