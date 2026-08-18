/** 驱动插件。inject 只等 llm 服务本身；适配器路由是兄弟插件的运行时注册，挂 llm/adapters-updated 等它。 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'

export const inject = ['llm']

const ROUTE = 'local-anthropic'

export function apply(ctx) {
  let done = false
  const kick = () => {
    if (done) return
    if (!ctx.llm.listProviders().some((provider) => provider.id === ROUTE)) return
    done = true
    void run(ctx)
  }
  ctx.on('llm/adapters-updated', kick)
  kick()
}

async function run(ctx) {
  const catalog = await ctx.llm.listModels(ROUTE)
  console.log(`route ${ROUTE} catalog: ${catalog.map((model) => model.id).join(', ')}`)

  if (process.env.QA_API_KEY === undefined) {
    console.log('QA_API_KEY not set — composition OK, live call skipped')
    process.exit(0)
  }

  const model = process.env.QA_MODEL ?? 'deepseek-v4-flash'
  const question = process.argv.slice(2).join(' ') || '用一句话说明插件化架构的好处'
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

  const reasoning = assembler.blocks().filter((block) => block.type === 'reasoning')
  if (reasoning.length > 0) {
    console.log(`── reasoning ──\n${reasoning.map((block) => block.text).join('\n')}`)
  }
  console.log(assembler.blocks().filter((block) => block.type === 'text').map((block) => block.text).join('\n'))

  if (usage !== undefined) {
    const parts = [
      `${usage.inputTokens} in`, `${usage.outputTokens} out`,
      ...usage.reasoningTokens !== undefined ? [`${usage.reasoningTokens} reasoning`] : [],
      ...usage.cacheReadTokens !== undefined ? [`${usage.cacheReadTokens} cache-read`] : [],
      ...usage.cacheWriteTokens !== undefined ? [`${usage.cacheWriteTokens} cache-write`] : [],
    ]
    console.log(`── model: ${model} (requested) · finish: ${finish.kind} · tokens: ${parts.join(' / ')} ──`)
  } else {
    console.log(`── model: ${model} (requested) · finish: ${finish.kind} · no usage reported ──`)
  }
  process.exit(0)
}
