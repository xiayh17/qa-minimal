# qa-minimal

> DeepSeek Harness 的生长过程 —— 不是缩小版，是解剖实验室。

每一级只引入一个新的**可感知能力闭包**，让你亲手观察：多了这些插件以后，系统究竟发生了什么变化。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的公开 npm 包构建。官方安装是完整的 Agent 平台（60+ 插件）；本仓库从 3 个插件开始，一级一级长出来。

## 生长树

```
                         Full Harness
                              ▲
                    Workflow / Subagent
                              ▲
                     Plan / Goal / Skill
                              ▲
                  Sandbox / Permission
                              ▲
                        Shell / FS
                              ▲
                   Session Persistence
                              ▲
                         Agent Loop          ← L1 (已实现)
                              ▲
                   LLM + Adapter + Driver     ← L0 (已实现)
                              ▲
                         qa-minimal
```

## 快速开始

```sh
git clone https://github.com/xiayh17/qa-minimal
cd qa-minimal && npm install

# 配置端点和密钥（不落盘在代码里）
cat > .env <<'EOF'
QA_BASE_URL=https://your-gateway.example
QA_API_KEY=sk-...
EOF
chmod 600 .env

# 运行
set -a && source .env && set +a
node run.mjs 0 "解释 CAP 定理"           # L0: 裸 LLM 调用
node run.mjs 1 --trace "解释 CAP 定理"   # L1: Agent + 事件流
node run.mjs 2 "记住编号 31415"          # L2: 持久化
node run.mjs 2 --resume <session-id> "编号是多少？"  # L2: 跨进程恢复
```

## 已实现的层级

| Level | 名称 | 新增能力闭包 | `--trace` 可见的变化 | 状态 |
|---|---|---|---|---|
| **L0** | Raw LLM | `dsh-llm` + 适配器 + 驱动 | 沉默——没有 session 事件 | ✅ |
| **L1** | Agent | `session` + `system-prompt` + `tools` + `agent` + `agent-loop` | `turn/start → step/start → request → assistant/chunk → assistant/message → step/end → turn/end` | ✅ |
| **L2** | Persistent Agent | `session-persistence-jsonl` + `checkpoint-policy` | 同 L1 + 退出后 `--resume` 可恢复 | ✅ |
| L3 | Workspace Reader | FS seam + local provider + read/search tools | 能读文件 | 📋 |
| L4 | Coding Agent | subprocess + shell + bash tool | 能跑命令 | 📋 |
| L5 | Safe Agent | sandbox + approval + permission | 同一命令被拒绝/审批 | 📋 |
| L6–L11 | → Full Product | 见 [docs/ladder.md](docs/ladder.md) | | 📋 |

## 固定测试套件

每个 Level 跑同一套任务。变的不是题目，是插件图。

| 任务 | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 |
|---|---|---|---|---|---|---|---|---|
| A. 回答知识问题 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| B. 记住本轮信息 | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| C. 重启后继续会话 | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| D. 阅读项目文件 | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| E. 运行测试并改文件 | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| F. 写工作区外文件 | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| G. 委派子 Agent | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

> **Agent 的能力不是一个大类里写死的，而是组合出来的。**

## L0 → L1：最重要的一课

```sh
# L0: 裸调模型
node run.mjs 0 --trace "解释 CAP 定理"
# [trace] (no session events — Stage 00 has no Agent)
# <answer>

# L1: 同样的问题，同样模型，但经过了 Agent 循环
node run.mjs 1 --trace "解释 CAP 定理"
# [trace] turn/start
# [trace] step/start
# [trace] request/header
# [trace] assistant/chunk × N
# [trace] assistant/message
# [trace] step/end
# [trace] turn/end
# <answer>
# ── session: qa-xxxxxxxx ──
```

L0 的沉默和 L1 的事件流对比，就是"调模型"和"运行 Agent"的区别。

## 仓库结构

```
stages/             每级一个目录，同时存在、可 diff
  00-llm-stream/    L0: 3 插件，裸 ctx.llm.stream()
  01-agent-loop/    L1: +5 插件，最小 Agent 闭包
  02-persistence/   L2: +2 插件，JSONL 持久化 + resume
fixtures/           固定测试项目（L3+ 用）
docs/
  ladder.md         完整 12 级路线图
  plugin-map.md     Harness 能力包地图
run.mjs             通用启动器：<stage> [--trace] [--resume <id>] <question>
```

每级保留自己的 `package.json`——diff 它就能看到依赖闭包是怎么长出来的。

## 文档

- [docs/ladder.md](docs/ladder.md) — 完整 12 级路线图 + 固定测试套件
- [docs/plugin-map.md](docs/plugin-map.md) — Harness 能力包地图 + Service Definition/Provider/Consumer 模式

## License

MIT