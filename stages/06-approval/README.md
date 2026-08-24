# Stage 06 — Approval & Permission Presets

The same sandboxed agent as Stage 05, but now the **approval gate** is active.
When the sandbox denies an operation, the model can escalate with a
justification; the approval gate asks the user for one-time authorization.

L6 = L5 + Approval.  Every capability from Stage 05 is still here — sandbox,
FS, shell, search, persistence, resume — plus the approval and permission
preset plugins.

## What changed from Stage 05

```diff
  (all Stage 05 plugins — sandbox + FS + shell + search + persistence are inherited)
+ @deepseek-ai/dsh-user-approval       approval gate: policy = ask
+ @deepseek-ai/dsh-permission-presets   combines sandbox/mode + approval/policy into presets
```

## The three-stage demonstration

```text
L4: write ../outside.txt → succeeds (no sandbox)
L5: write ../outside.txt → sandbox denies (no escalation path)
L6: write ../outside.txt → sandbox denies → model escalates with
     justification → approval gate asks → allowed-once → executes
```

`dsh-tool-bash` supports `sandbox_permissions + justification` in sandbox
mode: after a sandbox denial, the model can retry with a broader permission
request and a justification string.  The approval gate (`ctx.approval`) can
then grant a one-time authorization.

### Permission presets

`dsh-permission-presets` ties `sandbox/mode` and `approval/policy` together
into user-selectable presets:

| Preset | sandbox/mode | approval/policy |
|---|---|---|
| `read-only` | read-only | never |
| `workspace-write` | workspace-write | never (this is L5) |
| `workspace-write+ask` | workspace-write | ask (this is L6) |
| `danger-full-access` | none | auto-allow |

## Run

```sh
# Headless: approval resolves to "rejected" (no terminal to ask)
qa-minimal 6 'Write "hello" to ../outside.txt using bash'
qa-minimal 6 --trace 'Write "hello" to ../outside.txt using bash'

# Interactive (if supported): the approval gate prompts the user
# → user approves → allowed-once → the write executes
```

> Stages 3+ run in a disposable temp workspace.  `../outside.txt` resolves
> to `tmp/qa-<run>/outside.txt` — safely contained even if approved.

## What you see

In headless mode, the approval request fires but resolves to "rejected":

```
  [trace] tool/call              ← bash: echo "hello" > ../outside.txt
  [trace] tool/result            ← denied by sandbox
  [trace] tool/call              ← bash (escalated, with justification)
  [trace] approval/request       ← asks for one-time access
  [trace] approval/result        ← rejected (headless: no terminal)
  [trace] tool/result            ← denied by approval
  [trace] assistant/message      ← "The sandbox denied the write, and the
                                     approval request was rejected..."
```

In an interactive session, the `approval/request` would prompt the user.
Granting it produces `allowed-once`, and the escalated tool call executes.

## The L4 → L5 → L6 progression

Same model, same tools, same question, **same persona** (byte-for-byte frozen
from L4 onward).  The only difference across the three stages is the safety
layer:

| Stage | Safety layer | Behavior for `../outside.txt` |
|---|---|---|
| L4 | none | succeeds |
| L5 | sandbox only | denied by sandbox |
| L6 | sandbox + approval | denied → escalates → asks → allowed-once or rejected |

This is "一切皆插件" made visible: three completely different experiences from
the same capability graph, differing only in the safety plugins.