# Card Canvas

卡片笔记与无限白板工具 · **Phase 03 / Interaction**

Phase 01 建立工程、领域模型与双主题；Phase 02 建立无限画布的平移缩放与坐标系；Phase 03 让卡片成为可选中、可拖拽、可落盘的物理实体。

## 技术栈

- Vue 3 + TypeScript + Vite
- Tailwind CSS 3.4 + PostCSS / Autoprefixer（classic config + `darkMode: 'class'`）
- Pinia 状态管理
- Dexie 4 本地 IndexedDB
- @vueuse/core 主题同步
- @lucide/vue 图标

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

## 画布操作

- **触控板双指滑动**：平移
- **触控板捏合** / `Ctrl` + 滚轮：以光标为不动点缩放
- **空格 + 左键拖拽**：平移
- **鼠标中键拖拽**：平移
- **HUD**：缩小、放大、点击百分比恢复 100%、居中全部卡片
- 缩放范围：`10% – 300%`；到达边界时按钮禁用、百分比转为琥珀色反馈

## 卡片交互

- **点击卡片**：单选并显示主题化光环
- **点击空白画布**：取消选中
- **拖动卡片**：从卡片标题、右上角 grip、卡片留白或底栏拖动
- **内容区**：正文与原子笔记文本可被选中；标签与正文不会误触发卡片拖拽
- **拖拽死区**：屏幕位移小于 `3px` 视为点击；超过后才进入拖拽态
- **空格优先**：按住空格时，即使从卡片上起手也进入画布平移，不改动卡片与选中态
- **缩放补偿**：`worldDelta = screenDelta / viewport.scale`，在 30% 与 200% 下光标均与拾起点严格咬合
- **高程反馈**：拾起时 `scale(1.018)`、漫反射阴影增强、`z-index` 置于最上层；放下后平滑回落
- **持久化时机**：拖拽期间只写 DOM transform；`pointerup` 时一次性提交 Pinia，并异步 `db.boardItems.update`

## 本地数据

- 首次启动且 Dexie 为空时自动写入 3 张示例卡片与 3 个空间投影
- 所有拖拽后的最终世界坐标写入 `boardItems`
- 刷新页面后从 IndexedDB 恢复位置，并从相机重新取景
- 拖拽期间不写 Dexie，也不做大范围响应式更新

## 目录

```text
src/
├── assets/main.css              # Tailwind、双主题、动态 LOD 点阵、卡片阴影 token
├── components/
│   ├── canvas/
│   │   ├── CanvasStage.vue      # 视口容器、世界层、相机上下文与初始取景
│   │   ├── CanvasHUD.vue        # 缩放 / 居中悬浮胶囊
│   │   └── CardNode.vue         # 世界卡片、拖拽手柄、状态矩阵
│   ├── capture/                 # 1D 速记占位
│   └── inbox/                   # 待整理池占位
├── composables/
│   ├── useCanvas.ts             # 相机、锚点缩放、坐标换算、手势状态机
│   ├── useCardDrag.ts           # 卡片拖拽、死区、缩放补偿、落盘状态机
│   └── useTheme.ts              # useDark + useToggle 主题管理
├── data/seed.ts                 # 首次启动示例数据
├── db/index.ts                  # Dexie 单例
├── stores/
│   ├── board.ts                 # 卡片实体、空间投影、选中与持久化
│   └── workspace.ts             # 白板 / 选择等轻量 UI 状态
├── types/index.ts               # Card / BoardItem / Viewport / Connection
├── App.vue                      # 数据加载、画布、卡片列表与屏幕 UI
└── main.ts                      # 应用入口（挂载 Pinia）
```

## 架构约定

- **实体与投影解耦**：`Card` 是内容实体，`BoardItem` 是该卡片在某块白板上的世界坐标投影。
- **坐标换算**：`useCanvas.ts` 导出纯函数 `screenToWorld` / `worldToScreen`；`useCanvas()` 返回绑定实时相机的二参数版本，并通过 provide/inject 暴露给世界卡片。
- **绝对不动点缩放**：缩放动画每一帧都以固定世界锚点重算 pan，而非只在 wheel 事件里计算一次。
- **性能隔离**：卡片拖拽期间使用普通对象 + rAF + 直接 DOM transform；只有 `pointerup` 提交一次 Pinia 与一次 Dexie update。
- **主题持久化**：首次访问跟随系统；手动切换后明确写入 `light` / `dark`；首屏内联脚本恢复，避免闪烁。
- **可访问性**：屏幕阅读器可获知画布操作说明；HUD 与主题按钮有完整标签；减少动态效果时关闭飞行动画与平滑过渡。
