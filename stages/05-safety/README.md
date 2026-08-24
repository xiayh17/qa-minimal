# Stage 05 — Sandboxed Agent

**Capability ⊥ permission.** The same bash and FS tools as Stage 04, but now
wrapped in a sandbox. The model can still try — the sandbox says no.

L5 = L4 + Sandbox.  Every capability from Stage 04 is still here — FS tools,
shell, search, persistence, resume — but the FS and bash providers switch
from `*-local` to `*-sandbox` variants.

## What changed from Stage 04

```diff
  (all Stage 04 plugins — FS + shell + search + persistence are inherited)
- dsh-fs-local                  → replaced by sandboxed variant
- dsh-bash-local                → replaced by sandboxed variant
+ @deepseek-ai/dsh-sandbox-local       the sandbox boundary
+ @deepseek-ai/dsh-sandbox-policy      mode: workspace-write
+ @deepseek-ai/dsh-fs-sandbox          wraps dsh-fs-local with sandbox enforcement
+ @deepseek-ai/dsh-bash-sandbox        wraps dsh-bash-local with sandbox enforcement
```

This stage demonstrates **sandbox enforcement** only.  Approval and permission
presets are a separate capability closure — they arrive in Stage 06, where the
same out-of-workspace write is not silently denied but instead triggers an
approval request.

## Run

```sh
# This should FAIL — the sandbox denies writes outside the workspace
qa-minimal 5 'Write "hello" to ../outside.txt using bash'
qa-minimal 5 --trace 'Write "hello" to ../outside.txt using bash'
```

> Stages 3+ run in a disposable temp workspace.  `../outside.txt` resolves
> to `tmp/qa-<run>/outside.txt` — outside the workspace boundary but inside
> the disposable temp root.  In L4 (no sandbox) this succeeds but still
> doesn't pollute the real repo.  In L5 the sandbox denies it.

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
qa-minimal 4 'Write "hello" to ../outside.txt using bash'   # succeeds
qa-minimal 5 'Write "hello" to ../outside.txt using bash'   # denied by sandbox
```

Same model, same tools, same question, **same persona** (byte-for-byte frozen
from L4 onward). The ONLY difference is the sandbox layer.
This proves: **"can execute" and "is allowed to execute" are independent plugin layers.**