/** Stage 00 driver: raw LLM call. inject ['llm'], wait for adapter route, stream once, print, exit. */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'

export const inject = ['llm']

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
  const catalog = await ctx.llm.listModels(ROUTE)
  console.log(`catalog: ${catalog.map((m) => m.id).join(', ')}`)

  if (process.env.QA_TRACE === '1') {
    console.log('  [trace] (no session events — Stage 00 has no Agent)')
  }

  if (process.env.QA_API_KEY === undefined) {
    console.log('QA_API_KEY not set — composition OK, live call skipped')
    process.exit(0)
  }

  const model = process.env.QA_MODEL || 'deepseek-v4-flash'
  const question = process.env.QA_QUESTION || '用一句话说明插件化架构的好处'
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({
    provider: ROUTE,
    model,
    messages: [
      createUserMessage({
        content: [{ type: 'text', text: question }],
        source: { kind: 'user' },
      }),
    ],
  })) {
    assembler.push(chunk)
  }

  const { finish, usage } = assembler
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    console.error(`request failed: ${finish.failure.message}`)
    process.exit(1)
  }
  console.log(assembler.blocks().filter((b) => b.type === 'text').map((b) => b.text).join('\n'))
  if (usage !== undefined) {
    console.log(`── model: ${model} · finish: ${finish.kind} · tokens: ${usage.inputTokens} in / ${usage.outputTokens} out ──`)
  }
  process.exit(0)
}