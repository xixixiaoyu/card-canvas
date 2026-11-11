import type { Card } from '../../types'
import { normalizeTags } from '../tags'

const MAX_WORMHOLE_CHARACTERS = 35

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function buildWormholePrompt(cardA: Card, cardB: Card) {
  return `请对比下面两张卡片，穿透术语差异，找出它们在底层机制、神经回路、认知模式或能量代偿上的本质同构。

【卡片 A】
标题：${compactText(cardA.title)}
内容：${compactText(cardA.content)}

【卡片 B】
标题：${compactText(cardB.title)}
内容：${compactText(cardB.content)}

只输出一句可直接用作连线说明的假说，不要开场白，不要引号，不要解释，不超过 35 个汉字。`
}

export const WORMHOLE_SYSTEM_PROMPT =
  '你是跨学科认知研究者。你只输出一句精炼的底层机制假说，语言克制、具体、有因果指向，绝不使用模板化客套。'

export function buildTagPrompt(
  title: string,
  content: string,
  existingTags: Iterable<string>,
) {
  const tags = normalizeTags(existingTags)

  return `请为下面的原子卡片提炼 1 到 2 个斜杠层级标签。

当前标签体系：${tags.length ? tags.join(', ') : '暂无'}

标题：${compactText(title)}
内容：${compactText(content)}

规则：
1. 仅输出标签，使用空格、逗号或中文逗号分隔；
2. 每个标签必须包含斜杠，例如“心理学/防御机制”；
3. 优先复用已有父分支，没有合适分类时再新建；
4. 不要输出 #、引号、编号或任何解释。`
}

export const TAGS_SYSTEM_PROMPT =
  '你是知识体系编辑。你只输出 1 到 2 个简短、稳定的斜杠层级标签，不解释推理过程。'

export function parseWormholeLabel(raw: string) {
  const cleaned = compactText(raw)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/^(关系|连线说明|本质同构)[：:]\s*/u, '')

  return Array.from(cleaned).slice(0, MAX_WORMHOLE_CHARACTERS).join('').trim()
}

export function parseTagSuggestions(raw: string) {
  return normalizeTags(raw.replace(/[#，,]/g, ' ').split(/\s+/))
    .filter((tag) => tag.includes('/'))
    .map((tag) => Array.from(tag).slice(0, 64).join(''))
    .slice(0, 2)
}
