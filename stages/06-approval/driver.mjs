/**
 * Stage 06 driver: Approval & Permission Presets Agent.
 *
 * L6 = L5 + Approval.  The agent is still sandboxed, but now the approval
 * gate is active.  When the sandbox denies an operation, the model can
 * escalate with a justification string; the approval gate (ctx.approval)
 * then asks for user authorization.
 *
 * In headless mode there is no terminal to ask, so the approval resolves
 * to "rejected" — the model sees the denial and reports it.  In an
 * interactive session the user would see the request and can grant
 * one-time access (allowed-once), after which the operation executes.
 *
 * The default question is the same ../outside.txt write as L4/L5, making
 * the L4→L5→L6 progression a true single-variable experiment.
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
    || 'Write the text "hello" to a file at ../outside.txt using the bash tool. '
       + 'If the sandbox denies it, explain why and report what happened.'
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