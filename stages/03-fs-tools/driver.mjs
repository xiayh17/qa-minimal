/** Stage 03 driver: same Agent pattern as Stage 01. The only difference is the
 *  question — it asks the model to read a fixture file, which forces a tool call. */
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
    || 'Read the file fixtures/demo-project/src/calculator.js and explain what it does. Be concise.'
  const model = process.env.QA_MODEL || 'deepseek-v4-flash'

  if (trace) {
    ctx.on('session/event', (_session, event) => {
      console.log(`  [trace] ${event.type}`)
    })
  }

  const { agent } = await ctx.agents.create({
    sessionId: SessionId(`qa-${randomUUID()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: ROUTE, model },
  })
  await agent.whenIdle()

  if (trace) console.log(`  [trace] agent ready · session ${agent.session.id}`)

  agent.followup(createUserMessage({
    content: [{ type: 'text', text: question }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()

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