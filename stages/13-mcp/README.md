# Stage 13 — MCP Client

The same web-capable agent as Stage 12, plus the **MCP client bridge**:
the agent's tools no longer come only from built-in packages.  The bridge
connects to an external MCP server (stdio or streamable-http), discovers
its tools, and registers them on `ctx.tools` under server-qualified names
(`mcp__<serverName>__<rawName>`) — the same naming shape Claude Code and
Codex use.

L13 = L12 + MCP Client.  Every capability from Stage 12 is still here.

## What changed from Stage 12

```diff
  (all Stage 12 plugins are inherited)
+ @deepseek-ai/dsh-mcp-client   bridge: external MCP server tools → ctx.tools
```

## ctx.tools is an open registry

The bridge is a Consumer of the core `ctx.tools` registry — the same seam
`dsh-tool-fs` and `dsh-tool-bash` write tool schemas into.  Its only
service injection is `[tools]`.  An external process's tools become
first-class model-facing tools with zero changes to the agent loop.

One plugin instance bridges one server — there is no `servers` list.
`serverName` is required, must be unique across live instances, and
prefixes every public tool name that server publishes.  Mount further
instances for more servers.

## The demo server is a placeholder

No MCP server ships with this repo.  The configured command
(`demo-mcp-server`) does not exist, so the spawn fails fast with ENOENT
instead of hanging the boot.  That is deliberate: this stage demonstrates
the **degradation contract**.

With `failOnStartupError: false` (the default), an unreachable server
never blocks activation:

- the plugin comes up with zero tools from that server;
- the supervisor retries with bounded backoff — 10 attempts, 500ms
  doubling to a 30s ceiling, one warn log per attempt — then gives up
  with a loud error;
- the agent runs on its built-in tools throughout.

Set `failOnStartupError: true` to fail closed instead: plugin activation
is rejected when the initial connect or tool discovery fails.

To go live, point `command` at a real server:

```yaml
command: npx
args: ['-y', '@modelcontextprotocol/server-everything']
```

The `mcp__demo__*` tools then appear with no other change.

## Run

```sh
# Default question: list your tools — are there any mcp__demo__*?
qa-minimal 13 --trace
```

## What you see

The stage boots normally, the supervisor logs its retry warnings, and the
model answers from observation:

```
  (supervisor warn logs: connect to 'demo' failed, retrying 1/10 … 10/10)
  [trace] assistant/message    ← "No tool whose name starts with mcp__demo__
                                   is registered. The MCP client could not
                                   reach its 'demo' server, and the harness
                                   continued on built-in tools."
```

The trace shows no error turn and no crash — degradation, not failure.
With a real server configured, the same trace instead shows
`tool/call mcp__demo__*` / `tool/result` pairs, indistinguishable from
built-in tools.

## Known limits

- **The demo server is a placeholder.**  Nothing here exercises a real
  MCP round trip; only the failure path is real.
- **No dedicated approval policy.**  Like the web tools, MCP tools have
  no MCP-specific permission policy in this composition.  The per-call
  bound is `toolCallTimeoutMs` (default 60000).

## The L12 → L13 step

Same model, same persona (byte-for-byte frozen from L4 onward), same
everything — except the tool registry now accepts tools from processes
this repo does not control.
