# qa-minimal

DeepSeek Harness 的最小一问一答：3 个插件（抽象 LLM 服务 + 多供应商适配器 + 本地驱动），
不经过 agent-loop / sessions / tools——不是 harness 的 Agent，是一次裸的 `ctx.llm.stream()`。

> 这是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）
> 的最小技术样本，不是官方产品。官方安装是完整的 Agent 平台（工具/沙箱/会话/子代理/UI），
> 本仓库只演示"3 个插件就能一问一答"的下限。能力差异见官方文档。

## 结构

```
cordis.yml    插件组合：dsh-llm + dsh-llm-pi-ai（local-anthropic 路由）+ ./qa-plugin.mjs
qa-plugin.mjs 驱动插件，inject ['llm']；挂 llm/adapters-updated 等适配器注册路由，然后发一次请求
start.mjs     引导器：以本目录为 baseUrl 加载 cordis.yml（cordis bin 的 15 行等价物）
```

依赖全部来自公开 npm（固定 `0.1.0-rc.6`；dist-tag `latest` 停在残缺的 0.0.1-rc.1，务必显式钉版本）。
网关走 Anthropic Messages 线协议（`api: anthropic-messages`）。端点、key 都不落盘在配置里：
`baseURL` 由 `!!js` 表达式从环境变量 `QA_BASE_URL` 解析，key 由 `apiKeyEnv` 指向 `QA_API_KEY`，
适配器逐请求读取。

## 配置

把端点和 key 放进 `.env`（已 gitignore，chmod 600，勿提交）：

```sh
cat > .env <<'EOF'
QA_BASE_URL=https://your-gateway.example
QA_API_KEY=sk-...
EOF
chmod 600 .env
```

换变量名/模型字段：改 `cordis.yml` 里的 `apiKeyEnv`、`models` 等。

## 运行

```sh
npm install
npm start                                        # 无 key：只验证插件装配
set -a && source .env && set +a
npm start -- "解释 CAP 定理"                      # 默认 deepseek-v4-flash
QA_MODEL=deepseek-v4-pro npm start -- "…"        # 换模型
```

输出尾行是元信息：请求的模型、停止原因、token 用量。`(requested)` 表示这是请求目标——
Anthropic Messages 协议响应不强制回报服务端真实模型 id，网关转发时实际后端由网关决定。

## 架构备注

- `inject` 只等 `llm` 服务出现，不等兄弟插件的注册结果；路由到达走注册表事件
  `llm/adapters-updated`。
- profile 的 `providers` 字典键就是路由名；`api` 声明线协议，`models` 显式给出
  目录（自定义网关不在适配器内置 catalog 里，必须手写）。
- 想要完整 Agent 能力（工具、沙箱、会话重放、子代理、UI），用官方 `@deepseek-ai/dsh`。

## License

MIT