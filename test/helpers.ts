// Copies of UnoCSS internals the tests need. They live in the UnoCSS monorepo
// (`virtual-shared/integration`) and are not published as packages.
import type { SourceCodeTransformer, SourceCodeTransformerEnforce, UnocssPluginContext, UnoGenerator } from '@unocss/core'
import { collapseVariantGroup, notNull, parseVariantGroup, splitVariantGroupBody } from '@unocss/core'
import MagicString from 'magic-string'

const IGNORE_COMMENT = '@unocss-ignore'
const SKIP_START_COMMENT = '@unocss-skip-start'
const SKIP_END_COMMENT = '@unocss-skip-end'
// eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/no-useless-lazy, regexp/optimal-quantifier-concatenation, regexp/no-lazy-ends
const SKIP_COMMENT_RE = new RegExp(`(\/\/\\s*?${SKIP_START_COMMENT}\\s*?|\\/\\*\\s*?${SKIP_START_COMMENT}\\s*?\\*\\/|<!--\\s*?${SKIP_START_COMMENT}\\s*?-->)[\\s\\S]*?(\/\/\\s*?${SKIP_END_COMMENT}\\s*?|\\/\\*\\s*?${SKIP_END_COMMENT}\\s*?\\*\\/|<!--\\s*?${SKIP_END_COMMENT}\\s*?-->)`, 'g')

/** Default `pipeline.include` of the UnoCSS integrations. */
export const defaultPipelineInclude: RegExp[] = [/\.(vue|svelte|[jt]sx|vine.ts|mdx?|astro|elm|php|phtml|marko|html)($|\?)/]

/**
 * Runs the configured transformers of one `enforce` stage the way the UnoCSS
 * integrations do, including `@unocss-skip` regions. Source maps are left out.
 */
export async function applyTransformers(
  ctx: UnocssPluginContext,
  original: string,
  id: string,
  enforce: SourceCodeTransformerEnforce = 'default',
): Promise<{ code: string } | undefined> {
  if (original.includes(IGNORE_COMMENT))
    return

  const transformers = (ctx.uno.config.transformers ?? [])
    .filter((t: SourceCodeTransformer) => (t.enforce || 'default') === enforce)
  if (!transformers.length)
    return

  let code = original
  const skipMap = new Map<string, string>()
  let s: MagicString | undefined

  for (const t of transformers) {
    if (t.idFilter) {
      if (!t.idFilter(id))
        continue
    }
    else if (!ctx.filter(code, id)) {
      continue
    }
    if (t.codeFilter && !t.codeFilter(code, id))
      continue

    s ??= new MagicString(transformSkipCode(code, skipMap))
    await t.transform(s, id, ctx)
    if (s.hasChanged()) {
      code = restoreSkipCode(s.toString(), skipMap)
      s = new MagicString(code)
    }
  }

  if (code !== original)
    return { code }
}

function transformSkipCode(code: string, map: Map<string, string>) {
  let index = 0
  for (const [matched] of code.matchAll(SKIP_COMMENT_RE)) {
    const key = `@unocss-skip-placeholder-${index++}`
    map.set(key, matched)
    code = code.replace(matched, key)
  }
  return code
}

function restoreSkipCode(code: string, map: Map<string, string>) {
  for (const [key, matched] of map.entries())
    code = code.replaceAll(key, matched)
  return code
}

/**
 * Sorts utilities the way the `unocss/order` ESLint rule does. Exported from
 * `@unocss/core` as `sortRules` after 66.12.0.
 */
export async function sortRules(rules: string, uno: UnoGenerator): Promise<string> {
  const unknown: string[] = []

  if (!uno.config.details)
    uno.config.details = true

  const expandedResult = parseVariantGroup(rules)
  rules = expandedResult.expanded

  const result: Array<[number, string] | undefined> = []
  for (const i of splitVariantGroupBody(rules).map(item => item.value)) {
    if (!i)
      continue
    const token = await uno.parseToken(i)
    if (token == null) {
      unknown.push(i)
      result.push(undefined)
      continue
    }
    const variantRank = (token[0][5]?.variantHandlers?.length || 0) * 100_000
    result.push([token[0][0] + variantRank, i])
  }

  let sorted = result
    .filter(notNull)
    .sort((a, b) => (a[0] - b[0]) || a[1].localeCompare(b[1]))
    .map(i => i[1])
    .join(' ')

  if (expandedResult.prefixes.length)
    sorted = collapseVariantGroup(sorted, expandedResult.prefixes)

  return [...unknown, sorted].join(' ').trim()
}
