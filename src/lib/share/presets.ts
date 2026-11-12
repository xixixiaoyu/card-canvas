export type ShareRatioId = 'square' | 'portrait' | 'landscape'
export type ShareThemeId =
  'dawn' | 'midnight' | 'tide' | 'archive' | 'blush' | 'moss'

export interface ShareRatio {
  id: ShareRatioId
  label: string
  description: string
  width: number
  height: number
}

export interface ShareTheme {
  id: ShareThemeId
  name: string
  note: string
  swatches: [string, string, string]
  background: string
  ink: string
  muted: string
  accent: string
  border: string
  tagBackground: string
  tagInk: string
  watermark: string
  pattern: string
}

export const SHARE_RATIOS: ShareRatio[] = [
  {
    id: 'square',
    label: '1:1',
    description: '方形卡片',
    width: 1080,
    height: 1080,
  },
  {
    id: 'portrait',
    label: '3:4',
    description: '竖版海报',
    width: 1080,
    height: 1440,
  },
  {
    id: 'landscape',
    label: '16:9',
    description: '横版分享',
    width: 1280,
    height: 720,
  },
]

export const SHARE_THEMES: ShareTheme[] = [
  {
    id: 'dawn',
    name: '晨纸张',
    note: '温暖、安静、适合思考笔记',
    swatches: ['#f7f0e2', '#d9be98', '#9b5c2d'],
    background:
      'radial-gradient(circle at 82% 10%, rgba(255,255,255,.86), transparent 34%), linear-gradient(145deg, #f8f1e4 0%, #ede1cd 100%)',
    ink: '#332b23',
    muted: '#786b5d',
    accent: '#9b5c2d',
    border: 'rgba(120, 89, 54, .19)',
    tagBackground: 'rgba(255, 253, 247, .58)',
    tagInk: '#8a5230',
    watermark: 'rgba(82, 64, 46, .54)',
    pattern: 'rgba(96, 70, 42, .055)',
  },
  {
    id: 'midnight',
    name: '午夜墨',
    note: '深邃、克制、适合灵感切片',
    swatches: ['#121519', '#2d333a', '#d7b66c'],
    background:
      'radial-gradient(circle at 82% 12%, rgba(215,182,108,.12), transparent 30%), linear-gradient(145deg, #171b20 0%, #090b0e 100%)',
    ink: '#f0ede5',
    muted: '#a7a49d',
    accent: '#d7b66c',
    border: 'rgba(255, 255, 255, .11)',
    tagBackground: 'rgba(255, 255, 255, .055)',
    tagInk: '#e5d4aa',
    watermark: 'rgba(233, 229, 219, .45)',
    pattern: 'rgba(255, 255, 255, .045)',
  },
  {
    id: 'tide',
    name: '海盐蓝',
    note: '清透、冷静、适合方法与结构',
    swatches: ['#e9f1f2', '#b8d6d9', '#2f747b'],
    background:
      'radial-gradient(circle at 84% 9%, rgba(255,255,255,.82), transparent 32%), linear-gradient(145deg, #edf5f5 0%, #c9dfe1 100%)',
    ink: '#19373c',
    muted: '#5f777b',
    accent: '#2f747b',
    border: 'rgba(42, 100, 108, .18)',
    tagBackground: 'rgba(255, 255, 255, .5)',
    tagInk: '#28676e',
    watermark: 'rgba(32, 72, 78, .5)',
    pattern: 'rgba(32, 97, 104, .05)',
  },
  {
    id: 'archive',
    name: '档案馆',
    note: '纸感、秩序、适合知识与引用',
    swatches: ['#eee7d8', '#cfbea0', '#725839'],
    background:
      'radial-gradient(circle at 88% 6%, rgba(255,255,255,.72), transparent 29%), linear-gradient(145deg, #f1ebdf 0%, #d7c6a8 100%)',
    ink: '#3b3126',
    muted: '#746552',
    accent: '#725839',
    border: 'rgba(101, 79, 51, .2)',
    tagBackground: 'rgba(255, 252, 245, .5)',
    tagInk: '#695034',
    watermark: 'rgba(88, 68, 44, .5)',
    pattern: 'rgba(97, 74, 45, .065)',
  },
  {
    id: 'blush',
    name: '晚霞纸',
    note: '柔和、感性、适合关系与自省',
    swatches: ['#f6e9e3', '#e4c9c0', '#a95953'],
    background:
      'radial-gradient(circle at 80% 10%, rgba(255,255,255,.78), transparent 32%), linear-gradient(145deg, #f8ece7 0%, #e6cec5 100%)',
    ink: '#482f2d',
    muted: '#806763',
    accent: '#a95953',
    border: 'rgba(147, 79, 73, .17)',
    tagBackground: 'rgba(255, 251, 248, .5)',
    tagInk: '#97534e',
    watermark: 'rgba(108, 65, 61, .48)',
    pattern: 'rgba(141, 77, 71, .05)',
  },
  {
    id: 'moss',
    name: '苔原',
    note: '自然、沉着、适合长期生长',
    swatches: ['#e9ece2', '#c8d1c0', '#536d58'],
    background:
      'radial-gradient(circle at 83% 8%, rgba(255,255,255,.76), transparent 31%), linear-gradient(145deg, #edf0e7 0%, #ced8c6 100%)',
    ink: '#29372d',
    muted: '#637066',
    accent: '#536d58',
    border: 'rgba(66, 91, 72, .17)',
    tagBackground: 'rgba(255, 255, 252, .48)',
    tagInk: '#4f6853',
    watermark: 'rgba(56, 76, 61, .48)',
    pattern: 'rgba(50, 81, 59, .05)',
  },
]

export function normalizeShareContent(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(
          /^!\[([^\]]*)\]\(attachment:\/\/[^)]+\)$/u,
          (_, alt: string) => (alt.trim() ? `[图片：${alt.trim()}]` : '[图片]'),
        )
        .replace(/^\s*#{1,6}\s+/u, '')
        .replace(/^\s*[-*+]\s+\[([ xX])\]\s+/u, (_, checked: string) =>
          checked.trim() ? '☑ ' : '☐ ',
        )
        .replace(/^\s*\d+[.)]\s+/u, '')
        .replace(/^\s*[-*+]\s+/u, '· ')
        .replace(/\*\*([^*]+)\*\*/gu, '$1')
        .replace(/==([^=]+)==/gu, '$1')
        .replace(/`([^`]+)`/gu, '$1')
        .replace(/(^|[^*])\*([^*\n]+)\*/gu, '$1$2')
        .trimEnd(),
    )
    .join('\n')
    .trim()
}

export function buildShareFilename(
  title: string,
  themeId: ShareThemeId,
  ratioId: ShareRatioId,
) {
  const safeTitle = title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48)

  return `card-canvas_${safeTitle || 'untitled'}_${themeId}_${ratioId}.png`
}

export function formatShareDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(timestamp))
}
