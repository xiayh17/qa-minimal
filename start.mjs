#!/usr/bin/env node
/** Boot ./cordis.yml regardless of the caller's cwd: baseUrl anchors relative plugin entries here. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = new URL('.', import.meta.url).href

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@deepseek-ai/cordis-plugin-include',
  config: { path: new URL('./cordis.yml', import.meta.url).pathname },
})
