# Card Canvas

卡片笔记与无限白板工具 · **Phase 01 / Foundation**

本阶段只搭建可扩展的工程骨架与双主题视觉基底：全屏点阵画布、验收卡片、领域模型、Dexie 数据库、Pinia 状态层均已就位，暂不包含画布平移 / 缩放算法。

## 技术栈

- Vue 3 + TypeScript + Vite
- Tailwind CSS 3.4 + PostCSS / Autoprefixer（保留 classic config 与 `darkMode: 'class'`；v4 的 CSS-first 迁移留给后续阶段）
- Pinia 状态管理
- Dexie 4 本地 IndexedDB
- @vueuse/core 主题同步
- @lucide/vue 图标（`lucide-vue-next` 已由上游废弃）

## 开发

```bash
pnpm install
pnpm dev
```

类型检查、生产构建与预览：

```bash
pnpm typecheck
pnpm build
pnpm preview
```

## 目录

```text
src/
├── assets/main.css          # Tailwind 入口、双主题点阵与全屏重置
├── components/
│   ├── canvas/              # CanvasStage / CardNode
│   ├── capture/             # 1D 速记占位
│   └── inbox/               # 待整理池占位
├── composables/useTheme.ts  # useDark + useToggle 主题管理
├── db/index.ts              # Dexie 单例与三张表
├── stores/workspace.ts      # Pinia 临时视口 / 选择状态
├── types/index.ts           # Card Entity 与 BoardItem 投影契约
├── App.vue                  # 双主题验收看板
└── main.ts                  # 应用入口（挂载 Pinia）
```

## 设计约定

- **实体与投影解耦**：`Card` 是内容实体，`BoardItem` 只记录它在某块白板上的空间坐标。
- **主题持久化**：首次访问跟随系统（`auto`）；首次点击切换后始终写入明确的 `light` / `dark`，不会因系统切换而覆盖用户选择。首屏由 `index.html` 内联脚本恢复主题，避免闪烁。
- **双主题过渡**：点阵由两层独立颜色叠加交叉淡入，卡片、标签、文字与阴影使用 CSS 过渡，关闭了 VueUse 默认的 transition 阻断。
- **响应式边界**：页面本身永不滚动；极短视口下画布主区域成为唯一可滚动的安全容器，同时按高度渐进收紧标题、卡片留白与辅助信息。
- **可访问性**：主题按钮带有 `aria-pressed` 与动态 `aria-label`，微型元信息使用满足可读性的中性色；系统开启「减少动态效果」时过渡自动降级。
