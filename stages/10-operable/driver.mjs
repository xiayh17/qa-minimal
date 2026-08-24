/**
 * Stage 10 driver: Operable Harness.
 *
 * L10 = L9 + Operability.  The agent is the full L9 workflow agent —
 * stateful tasks, goals, subagent registry, jobs, token metering,
 * compaction — plus the operability closure: provider retry
 * (dsh-llm-retry), runtime invariants (dsh-invariants), and whole-session
 * stats (dsh-session-stats, pending on the absent sessionProjections
 * service; see cordis.yml gap notes).
 *
 * "Runs" ≠ "operable":
 *   - retry      makes transient provider failures heal themselves —
 *                watch for `llm/retry` / `llm/retry-started` in --trace
 *                when the gateway flakes (the smoke run's dead baseURL
 *                classifies as TRANSPORT and retries twice before failing)
 *   - telemetry  would hand redacted session records to a backend — the
 *                L10 seam (dsh-session-telemetry) is a Service Definition
 *                with no installed backend, so it is documented but not
 *                mounted (see cordis.yml gap notes)
 *   - invariants audit the durable log at runtime via companion plugins
 *
 * The default question is the same fix-the-bug task as the earlier
 * stages: the interesting difference is not the answer but the trace —
 * retry/telemetry/stats events around the same work.
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
    || 'Fix the divide-by-zero bug in src/calculator.js and run the tests.'
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
