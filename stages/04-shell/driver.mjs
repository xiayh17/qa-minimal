/** Stage 04 driver: same Agent pattern. The question asks the model to fix a bug
 *  and verify — forcing it to read, edit, and run a command. */
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
    || 'Read fixtures/demo-project/src/calculator.js, find the divide-by-zero bug, '
       + 'fix it by adding a guard for b === 0 that throws an Error, '
       + 'then run: node -e "const c = require(\'./fixtures/demo-project/src/calculator\'); '
       + 'try { c.divide(1,0) } catch(e) { console.log(e.message) }" to verify.'
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