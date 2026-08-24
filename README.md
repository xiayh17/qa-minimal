# qa-minimal

> DeepSeek Harness 的生长过程 —— 不是缩小版，是解剖实验室。

每一级只引入一个新的**可感知能力闭包**，让你亲手观察：多了这些插件以后，系统究竟发生了什么变化。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的公开 npm 包构建。官方安装是完整的 Agent 平台（60+ 插件）；本仓库从 3 个插件开始，一级一级长出来。

## 生长树

```
                    Workflow / Subagent            ← L8/L9 (已实现)
                              ▲
                     Plan / Goal / Todo            ← L7 (已实现)
                              ▲
              Approval / Permission          ← L6 (已实现)
                              ▲
                  Sandbox Enforcement          ← L5 (已实现)
                              ▲
                   Shell / Process              ← L4 (已实现)
                              ▲
                     Workspace FS              ← L3 (已实现)
                              ▲
                   Session Persistence          ← L2 (已实现)
                              ▲
                         Agent Loop             ← L1 (已实现)
                              ▲
                   LLM + Adapter + Driver       ← L0 (已实现)
                              ▲
                         qa-minimal
```

L10（Operable：retry / telemetry / stats）与 L11（Productized：settings /
credentials 热切换）是横切层，作用于整张能力图而非单个闭包，未画在树中。

每一级严格满足 **L(n) ⊇ L(n-1)**：上层继承下层的全部插件，只新增一个能力闭包。

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
node run.mjs 0 "解释 CAP 定理"               # L0: 裸 LLM 调用
node run.mjs 1 --trace "解释 CAP 定理"        # L1: Agent + 事件流
node run.mjs 2 "记住编号 31415"              # L2: 持久化
node run.mjs 2 --resume <session-id> "编号？" # L2: 跨进程恢复
node run.mjs 3 "Read src/calculator.js and explain"  # L3: 读/写文件
node run.mjs 4 "Fix the divide-by-zero bug in src/calculator.js"  # L4: 跑命令
node run.mjs 5 'Write "hello" to ../outside.txt'      # L5: 被沙箱拒绝
node run.mjs 6 'Write "hello" to ../outside.txt'      # L6: 请求审批
node run.mjs 7 "用 todo 跟踪修复 src/calculator.js 的 bug"   # L7: todo/plan/goal 状态
node run.mjs 8 "Delegate investigating src/calculator.js to a subagent"  # L8: 委派
node run.mjs 9 --trace "<一个需要多轮迭代的长任务>"            # L9: ralph 循环 + compaction
node run.mjs 10 --trace "Fix the divide-by-zero bug in src/calculator.js"  # L10: llm/retry 事件
node run.mjs 11 "Fix the divide-by-zero bug in src/calculator.js"          # L11: settings/credentials 热切换

# 观察能力图怎样生长
node run.mjs inspect 5                        # 查看某级挂载的全部插件
node run.mjs diff 4 5                         # 对比两级之间的插件差异
```

> L3+ 的任务在一次性临时工作区 (`tmp/qa-<run>/`) 中运行，文件副作用和
> 越界写入不会污染 git 跟踪的 fixture。你可以连续跑 100 次，结果都一样。

## 已实现的层级

| Level | 名称 | 新增能力闭包 | `--trace` 可见的变化 | 状态 |
|---|---|---|---|---|
| **L0** | Raw LLM | `dsh-llm` + 适配器 + 驱动 | 沉默——没有 session 事件 | ✅ |
| **L1** | Agent | `session` + `system-prompt` + `tools` + `agent` + `agent-loop` | `turn/start → step/start → request → assistant/chunk → assistant/message → step/end → turn/end` | ✅ |
| **L2** | Persistent Agent | `session-persistence-jsonl` + `checkpoint-policy` | 同 L1 + 退出后 `--resume` 可恢复 | ✅ |
| **L3** | Workspace FS | `fs-local` + `fs-observation-policy` + `tool-fs` | `tool/call` → `tool/result`（模型调用 read/write/edit 操作真实文件） | ✅ |
| **L4** | Shell / Process | `subprocess` + `shell-env` + `bash-local` + `tool-bash` + `tool-fs-search` | `tool/call`（bash）→ `tool/result`（exit code）+ glob/grep 搜索 | ✅ |
| **L5** | Sandboxed Agent | `sandbox-local` + `sandbox-policy` + `fs-sandbox` + `bash-sandbox` | 同一 bash 命令写工作区外 → sandbox 拒绝 | ✅ |
| **L6** | Approval & Permission | `user-approval` + `permission-presets` | 越界写入 → sandbox 拒绝 → 模型 escalate → 审批请求 | ✅ |
| **L7** | Stateful Task Agent | `tool-todo` + `plan-mode` + `goal` + `tool-goal` + `workspace`（+ 支撑：`user-questions`、`storage` + `storage-sqlite` + `storage-domain`） | `todo/write`、`goal/*` 事件；exit_plan_mode 评审流 | ✅ |
| **L8** | Multi-Agent | `subagent` + `subagent-spawn/fork-in-process` + `tool-subagent`×2 + `jobs-local` + `tool-jobs` | `subagent` / `subagent_fork` / `job_*` 工具出现，真实委派 | ✅ |
| **L9** | Workflow Agent | `workflow-worker-thread` + `tool-ralph` + `token-meter` + `compaction-basic` + `compaction-tool-result-pruner` | ralph fresh-agent 循环；token 计量驱动 compaction | ✅ |
| **L10** | Operable Harness | `llm-retry` + `invariants` + `session-projection` + `session-stats` | `llm/retry` → `llm/retry-started`；session 统计激活 | ✅ |
| **L11** | Productized | `settings-file` + `credentials-local` | `settings.yaml` watch 热重载；`ctx.credentials` 真实解析密钥 | ✅ |
| L12 | Full Product | host + API + client + Web UI（见 [docs/ladder.md](docs/ladder.md)） | | 📋 |

## 行为结果矩阵

每个 Level 跑同一套任务（A–G 七项）。变的不是题目，是插件图。
矩阵不用 ✓/✗，而是标注**行为结果**——"能力"和"策略"是两个独立维度。

| 任务 | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A. 回答知识问题 | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds |
| B. 记住本轮信息 | unsupported | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds |
| C. 重启后继续会话 | unsupported | unsupported | persists | persists | persists | persists | persists | persists | persists | persists | persists | persists |
| D. 阅读项目文件 | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds |
| E. 运行测试并改文件 | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds | succeeds |
| F. 写工作区外文件 | unsupported | unsupported | unsupported | unsupported | succeeds | denied-by-sandbox | asks-approval | asks-approval | asks-approval | asks-approval | asks-approval | asks-approval |
| G. 跟踪多步任务 (todo/plan/goal) | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds | succeeds | succeeds |
| H. 委派子 Agent | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds | succeeds |
| I. 长任务运行 (ralph/compaction) | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds | succeeds |
| J. 瞬时故障自愈 (retry) + 可测量 | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | succeeds | succeeds |

> **L5 的 F 标为 `denied-by-sandbox`——这正是该 stage 的测试 PASS。**
> 被安全拒绝本身就是正确行为，不是"失败"。L6 的 F 标为
> `asks-approval`——同样是被拒绝后的正确升级路径。

> **Agent 的能力不是一个大类里写死的，而是组合出来的。**

## L0 → L1：最重要的一课

```sh
# L0: 裸调模型
node run.mjs 0 --trace "解释 CAP 定理"
# [trace] (no session events — Stage 00 has no Agent)
# <answer>

# L1: 同一用户任务、同一 provider、同一 model，但经过了 Agent 循环
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
注意：L1 引入 `dsh-system-prompt` 后默认加入 Harness identity，所以
L0 和 L1 并非"完全相同的 request"——相同的是 user task、provider、model。

## L4 → L5 → L6：能力 ⊥ 权限

```sh
# L4: 无沙箱——写工作区外文件，成功
node run.mjs 4 'Write "hello" to ../outside.txt using bash'
# ✓ wrote ../outside.txt

# L5: 有沙箱——同一命令，被拒绝
node run.mjs 5 'Write "hello" to ../outside.txt using bash'
# ✗ denied by sandbox: path outside workspace

# L6: 沙箱 + 审批——同一命令，请求用户批准
node run.mjs 6 'Write "hello" to ../outside.txt using bash'
# → sandbox denies → model escalates with justification
# → approval/request → allowed-once (interactive) or rejected (headless)
```

同一模型、同一工具、同一问题、**同一 persona**（从 L4 起逐字冻结）。
唯一变化是安全层——这证明"能执行"和"被允许执行"是两个独立的插件层。
L5 证明 sandbox 可以静默拒绝；L6 进一步展示拒绝后的审批升级路径。

## 观察能力图怎样生长

```sh
# 查看某级挂载的全部插件
node run.mjs inspect 5
# Stage 05 — Sandboxed Agent
# Mounted plugins: 18
#   dsh-llm
#   dsh-llm-pi-ai
#   ...

# 对比两级之间的插件差异
node run.mjs diff 4 5
# diff: Stage 4 → Stage 5
# Removed:
#   - dsh-bash-local
# Added:
#   + dsh-sandbox-local
#   + dsh-sandbox-policy
#   + dsh-fs-sandbox
#   + dsh-bash-sandbox
```

## 仓库结构

```
stages/             每级一个目录，同时存在、可 diff
  00-llm-stream/    L0: 3 插件，裸 ctx.llm.stream()
  01-agent-loop/    L1: +5 插件，最小 Agent 闭包
  02-persistence/   L2: +2 插件，JSONL 持久化 + resume
  03-fs-tools/      L3: +3 插件，FS 能力缝 (read/write/edit)
  04-shell/         L4: +5 插件，Shell 能力缝 (bash + glob/grep)
  05-safety/        L5: +4 插件，Sandbox 强制执行
  06-approval/      L6: +2 插件，Approval + Permission Presets
  07-stateful-tasks/ L7: +9 插件，todo / plan-mode / goal / workspace
  08-multi-agent/   L8: +7 插件，subagent (spawn/fork) + jobs
  09-workflow/      L9: +7 插件，workflow 引擎 + ralph + compaction
  10-operable/      L10: +5 插件，retry + invariants + stats
  11-productized/   L11: +4 插件，settings + credentials 热切换
lib/
  workspace.mjs     一次性临时工作区（L3+ 使用）
fixtures/           固定测试项目（calculator.js，含待修 bug）
docs/
  ladder.md         完整路线图
  plugin-map.md     Harness 能力包地图
run.mjs             通用启动器：<stage> [--trace] [--resume <id>] <question>
                    qa-minimal inspect <stage>
                    qa-minimal diff <stage-a> <stage-b>
```

每级保留自己的 `package.json`——diff 它就能看到依赖闭包怎么长出来的。

## 文档

- [docs/ladder.md](docs/ladder.md) — 完整路线图 + 行为结果矩阵
- [docs/plugin-map.md](docs/plugin-map.md) — Harness 能力包地图 + Service Definition/Provider/Consumer 模式

## License

MIT