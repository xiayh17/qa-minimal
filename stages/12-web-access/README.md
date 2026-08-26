# Stage 12 — Web Access

The same productized agent as Stage 11, but it can now leave the local
environment: the **web capability seam** gives the model `web_search` and
`web_fetch`.  Everything before this stage — files, shell, subagents,
workflows — acted on the host.  These two tools reach the public internet.

L12 = L11 + Web Access.  Every capability from Stage 11 is still here —
sandbox, approval, stateful tasks, skills, subagents, workflow, retry,
settings, credentials — plus the web runtime, one search provider, one
fetch provider, and the model-facing web tools.

## What changed from Stage 11

```diff
  (all Stage 11 plugins are inherited)
+ @deepseek-ai/dsh-web                 ctx.web: the WebRuntime service — provider
                                       registries for search and fetch
+ @deepseek-ai/dsh-web-search-deepseek search provider "deepseek-official"
+ @deepseek-ai/dsh-web-fetch-http      fetch provider: plain HTTP GET
+ @deepseek-ai/dsh-tool-web            consumer: web_search / web_fetch tool schemas
```

## A seam that is not an abstract class

The earlier abstract seams (`dsh-jobs`, `dsh-compaction`, `dsh-settings`)
work by replacement: the provider extends the base, re-registers the same
service name, and the abstract entry stays disabled.  `dsh-web` does not
follow that pattern.  WebRuntime **is** the runtime — it mounts directly,
and providers register INTO `ctx.web` via `registerSearchProvider` /
`registerFetchProvider` without ever claiming the `web` service name.
So all four entries mount enabled, and there is no disabled abstract row.

With exactly one usable provider of each kind, selection auto-resolves —
no `searchProvider` / `fetchProvider` config and no `$DSH_WEB_*_PROVIDER`
environment variable is needed.

## One search = one auxiliary model turn

`dsh-web-search-deepseek` is not a cheap retrieval API.  Each `web_search`
call is a complete Anthropic Messages request to a separate model (default
`deepseek-v4-flash`) carrying the native `web_search_20250305` server tool.

The auxiliary request reuses this repo's gateway route: `baseURL` falls
back to `$QA_BASE_URL` (`/messages` is appended), and the key reference is
`QA_API_KEY`, resolved per search through `ctx.credentials` (L11) — a
rotated key reaches the next call without a restart.

`dsh-web-fetch-http` is simpler: a plain HTTP GET with size and
content-type limits.  No browser required.

## Run

```sh
# Default question: find the current Node.js LTS release via web_search
qa-minimal 12 --trace

# Fetch a page directly
qa-minimal 12 --trace 'Fetch https://example.com and tell me what it says'
```

## What you see

```
  [trace] tool/call            ← web_search (query)
  [trace] web/deepseek-search-llm-request   ← the auxiliary model turn
  [trace] tool/result          ← search results (≤ 8 per call)
  [trace] tool/call            ← web_fetch (url)
  [trace] tool/result          ← page body (size / content-type limited)
  [trace] assistant/message    ← answer with cited source URLs
```

The `web/deepseek-search-llm-request` event is the observable proof that
one search costs a full model turn, not a lookup.

## Known limits

- **Web tools bypass the L6 approval gate.**  The packages define no
  web-specific permission policy, so in a headless run web access is
  unmediated.  The only brakes are `searchMaxResults` / `searchMaxQueries`
  and the 30s cooperative tool-call budget.
- **Search is not cheap.**  Every `web_search` spends a complete auxiliary
  model turn — latency and tokens on top of the main conversation.

## The L11 → L12 step

Same model, same persona (byte-for-byte frozen from L4 onward), same
safety layers.  The only difference: the tool surface now crosses the
machine boundary.
