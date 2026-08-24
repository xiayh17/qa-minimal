/**
 * Stage 09 driver: Workflow Agent.
 *
 * L9 = L8 + long-task runtime closure.  On top of the L7/L8 stateful,
 * multi-agent graph (todos, goals, subagents, background jobs) this stage
 * mounts the task-runtime seam: ctx.tokenMeter measures context pressure,
 * dsh-compaction-basic auto-compacts the surface when pressure crosses 80%
 * of the context window, the tool-result pruner bounds oversized outputs,
 * and the `ralph` tool exposes a bounded fresh-agent loop over the workflow
 * and subagent seams.
 *
 * The default question is a long multi-round build task: plan with the todo
 * list, create a script, then iterate — run, extend, re-run — across many
 * steps.  It exercises exactly what L9 adds: sustained multi-step work with
 * token accounting and compaction standing by, instead of a single
 * ask-answer turn.
 *
 * The whole chain is live: the worker-thread engine gives
 * ctx.workflowEngine a real start(), the spawn/fork providers are
 * registered on ctx.subagents, and ralph's inject (tools, workflowEngine,
 * subagents, systemPrompt) is fully satisfied.
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
    || 'Build a tiny CLI in this workspace. First record a todo list with one task per step. '
       + 'Then: create hello.py that prints "hello"; run it; add a --name flag that greets a '
       + 'named person; run it again; add a --count flag that repeats the greeting N times; '
       + 'run it once more. Finally summarize what you built and how you verified each step.'
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
