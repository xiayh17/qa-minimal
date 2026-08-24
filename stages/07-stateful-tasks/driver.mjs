/**
 * Stage 07 driver: Stateful Task Agent.
 *
 * L7 = L6 + Stateful Task Seams.  The agent is still sandboxed and gated
 * by the approval layer, but it now owns three state seams on top of the
 * session event log:
 *
 *   - a todo list (todo_write → durable todo/write events),
 *   - a same-session goal (get_goal / create_goal / update_goal → durable
 *     goal/change events with compare-and-set revisions),
 *   - plan mode (declared but disabled in this stage's cordis.yml — the
 *     package's peer dependencies are not installed).
 *
 * The model reads and writes these states through ordinary tool calls;
 * none of them is hardcoded in the agent loop.  With --trace you can watch
 * todo/write and goal/change appear as session events, and with --resume
 * the reconstructed session replays them.
 *
 * The default question is a multi-step version of the L3–L6 fixture task:
 * the agent is asked to track its work with the todo list while fixing the
 * divide-by-zero bug, so the new state seams are exercised end to end.
 *
 * Runs in a disposable temp workspace.
 */
import { randomUUID } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const inject = ['llm', 'agents']

const ROUTE = 'local-anthropic'

export function apply(ctx) {
  let done = false
  const kick = () => {
    if (done) return
    if (!ctx.llm.listProviders().some((p) => p.id === ROUTE)) return
    done = true
    void run(ctx)
  }
  ctx.on('llm/adapters-updated', kick)
  kick()
}

async function run(ctx) {
  await ctx.get('loader')?.await()

  const trace = process.env.QA_TRACE === '1'
  const question = process.env.QA_QUESTION
    || 'Fix the divide-by-zero bug in src/calculator.js. Track the work with '
       + 'the todo_write tool: create a list (reproduce the bug, fix it, run '
       + 'the tests to verify), mark each task in_progress while you work on '
       + 'it and completed when done.'
  const model = process.env.QA_MODEL || 'deepseek-v4-flash'
  const resumeId = process.env.QA_RESUME

  if (trace) {
    ctx.on('session/event', (_session, event) => {
      console.log(`  [trace] ${event.type}`)
    })
  }

  let agent
  if (resumeId) {
    if (trace) console.log(`  [trace] resuming session ${resumeId}`)
    agent = (await ctx.agents.resume({
      resumeSessionId: SessionId(resumeId),
      agentOptions: { provider: ROUTE, model },
    })).agent
  } else {
    agent = (await ctx.agents.create({
      sessionId: SessionId(`qa-${randomUUID()}`),
      meta: { cwd: process.cwd() },
      agentOptions: { provider: ROUTE, model },
    })).agent
  }
  await agent.whenIdle()

  if (trace) console.log(`  [trace] agent ready · session ${agent.session.id}`)

  agent.followup(createUserMessage({
    content: [{ type: 'text', text: question }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()

  const sessions = ctx.get('sessions')
  if (sessions !== undefined) await sessions.flush(agent.session)

  const lastAssistant = [...agent.session.events]
    .reverse()
    .find((e) => e.type === 'assistant/message')
  const text = lastAssistant?.data?.message?.content
    ?.filter((b) => b.type === 'text')
    ?.map((b) => b.text)
    ?.join('') || '(no response)'

  console.log(text)
  console.log(`── session: ${agent.session.id} ──`)
  process.exit(0)
}
