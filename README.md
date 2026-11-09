# Card Canvas

卡片笔记与无限白板工具 · **Phase 05 / Hardening**

Phase 01 建立工程、领域模型与双主题；Phase 02 建立无限画布的平移缩放与坐标系；Phase 03 让卡片成为可选中、可拖拽、可落盘的物理实体；Phase 04 打通 **1D 速记 → 待整理池 → 2D 白板投放** 的知识摄入闭环；Phase 05 补齐测试、可访问性、多白板、撤销重做与数据安全。

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

类型检查、单元测试、E2E 与生产构建：

```bash
pnpm format:check       # Prettier
pnpm lint               # ESLint
pnpm typecheck          # vue-tsc
pnpm test               # Vitest：标签、坐标、store、历史、备份、弹窗、toast
pnpm test:e2e           # Playwright：投放 / 键盘 / 多标签 / 多白板 / 视口
pnpm build              # typecheck + vite build
pnpm preview
```

本地 E2E 默认复用系统 Chrome；CI 使用 Playwright Chromium。`.github/workflows/ci.yml` 会依次跑格式检查、lint、typecheck、单测、构建与 E2E。

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

## 速记与投放

### 1D 速记（Quick Capture）

- **唤出**：`⌘K` / `⌥N`，或顶栏「速记」按钮
- **字段**：标题、正文、标签（回车 / 逗号添加，`#标签` 在保存时自动解析）
- **保存**：`⌘↵` / `Ctrl ↵`；UI 立即关闭，卡片同步进入 Pinia、异步写入 `db.cards`
- **退出**：`Esc` 或点击遮罩；打开时自动聚焦标题，IME 组合输入期间不会误触发快捷键
- **契约**：只写 `Card` 实体，不创建任何 `BoardItem`，也不携带白板或世界坐标

### 待整理池（Inbox）

- 右侧可折叠抽屉，折叠时保留带未放置数量的竖排把手
- 数据完全由差集派生：`cards` 中尚无当前白板 `boardItems` 投影的卡片
- 支持标题 / 正文 / 标签搜索与多标签 AND 筛选；空状态提示「所有灵感均已上板」

### 跨层投放

- 从抽屉卡片按下并拖出，挂载真实卡片外观的幽灵节点；全程 Pointer Events，不使用 HTML5 Drag & Drop
- 幽灵通过 `translate3d` + `scale` 在 rAF 中只更新自身合成层，拖拽期间不写 Pinia / Dexie
- 松手在画布上时，以光标屏幕坐标经 `screenToWorld` 折算世界坐标，并按测量到的卡片高度将 **几何中心** 对齐落点：
  - `x = worldX - width / 2`
  - `y = worldY - height / 2`
- 投放后立即新增 `BoardItem`，差集自动把卡片从抽屉移除；刷新后位置从 Dexie 恢复

## 键盘与无障碍

- **速记**：`⌘K` / `⌥N` 打开；`Tab` 焦点锁定在弹窗内，背景 `inert`；`Esc` 关闭
- **Inbox**：卡片可通过 `Tab` 聚焦，`Enter` / `Space` 直接投放到视口中心（离屏测量真实高度，仍保持几何居中）
- **画布卡片**：可聚焦；方向键移动 `10px`，`Shift + 方向键` 移动 `1px`；`Enter` / `Space` 选中
- **撤销 / 重做**：`⌘Z` / `⇧⌘Z`（Windows 支持 `Ctrl+Y`），顶栏也有按钮
- **屏幕阅读器**：选中变化通过 `aria-live` 播报；字符漂移、焦点环、`aria-current` 均已补齐

## 多白板

- 顶栏白板切换器：新建、重命名、切换、两步确认删除
- `boards` 表为 Dexie v2；删除白板级联删除其 `boardItems` 与 `connections`，卡片实体保留
- 每块白板独立保存视口（`localStorage`），刷新/切板后恢复缩放与平移
- 卡片内容全局复用；Inbox 差集按当前白板计算

## 撤销与数据安全

- 捕获、投放、移动、编辑、移出白板、删除均可撤销/重做（内存历史，最多 50 步）
- 删除为软删除（`Card.isDeleted`），撤销可恢复卡片及其投影
- 抽屉内可导出/导入完整 JSON 备份（cards / boardItems / connections / boards）；导入按 id 合并
- 启动时申请 `navigator.storage.persist()`；写入失败会回滚并给出可重试 toast

## 本地数据

- 首次启动且 Dexie 为空时自动写入 3 张示例卡片与 3 个空间投影，并创建第一块白板
- 部分数据损坏（投影指向不存在的卡片）会在启动时清理，避免孤儿记录
- 速记只写 `cards`；投放只新增 `boardItems`，实体的 `updatedAt` 不被空间操作污染
- 全量加载在数百张卡片内表现良好；Inbox 分页 30 条，画布卡片启用 `content-visibility`
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
│   ├── board/
│   │   └── BoardSwitcher.vue    # 多白板新建 / 重命名 / 切换 / 删除
│   ├── capture/
│   │   └── QuickCapture.vue     # 1D 速记 / 编辑弹窗、焦点陷阱、标签解析
│   ├── inbox/
│   │   └── InboxShelf.vue       # 待整理抽屉、搜索 / 标签筛选、幽灵投放
│   └── ui/
│       ├── HighlightText.vue    # 搜索命中高亮
│       └── ToastStack.vue       # 错误 / 成功提示与重试
├── composables/
│   ├── useCanvas.ts             # 相机、锚点缩放、坐标换算、手势状态机
│   ├── useCardDrag.ts           # 卡片拖拽、死区、缩放补偿、落盘状态机
│   ├── useInboxDrag.ts          # 抽屉 → 画布 Pointer 拖拽、幽灵与投放换算
│   └── useTheme.ts              # useDark + useToggle 主题管理
├── data/seed.ts                 # 首次启动示例数据
├── db/index.ts                  # Dexie 单例（v2：boards 表）
├── lib/
│   ├── backup.ts                # 全量导出 / 导入与校验
│   ├── tab-sync.ts              # BroadcastChannel 跨标签页同步
│   ├── tags.ts                  # 标签归一化 / 解析 / 合并
│   └── view-state.ts            # 每块白板的视口持久化
├── stores/
│   ├── board.ts                 # 卡片、投影、历史栈、跨标签同步
│   ├── toast.ts                 # 瞬时提示队列
│   └── workspace.ts             # 白板列表 / 当前白板 / 选择
├── types/index.ts               # Card / Board / BoardItem / Viewport / Connection
├── App.vue                      # 启动、画布、卡片与屏幕 UI
└── main.ts                      # 应用入口（挂载 Pinia）

tests/                           # Vitest 单元测试
e2e/                             # Playwright 端到端测试
```

## 架构约定

- **实体与投影解耦**：`Card` 是内容实体，`BoardItem` 是该卡片在某块白板上的世界坐标投影。
- **坐标换算**：`useCanvas.ts` 导出纯函数 `screenToWorld` / `worldToScreen`；`useCanvas()` 返回绑定实时相机的二参数版本，并通过 provide/inject 暴露给世界卡片。
- **待整理池是派生状态**：不存在 `isPlaced` / `isArchived` 冗余字段；抽屉 = `cards` 与当前白板 `boardItems.cardId` 的差集，投放 / 删除投影后自动同步。
- **乐观写入**：速记先发布到 Pinia（UI 立即关闭、Badge 立即 +1），再异步 `db.cards.put`；失败时回滚内存状态。投放同理，`boardItems.put` 失败会移除刚挂载的投影。
- **投放换算**：幽灵卡片按真实世界宽度布局，因此 `offsetHeight` 就是世界高度；落点用 `screenToWorld(clientX, clientY)` 后再减去半宽 / 半高，几何中心严格对齐光标。
- **绝对不动点缩放**：缩放动画每一帧都以固定世界锚点重算 pan，而非只在 wheel 事件里计算一次。
- **性能隔离**：卡片拖拽期间使用普通对象 + rAF + 直接 DOM transform；只有 `pointerup` 提交一次 Pinia 与一次 Dexie update。
- **响应式 → Dexie 边界**：所有写入前通过 `plainRecord` 深拷贝，避免把 Vue Proxy 交给 IndexedDB 结构化克隆。
- **历史栈**：每个用户动作记录 `{ label, undo, redo }` 闭包，内存最多 50 步；撤销/重做本身不再入栈。
- **跨标签页**：`BroadcastChannel` 广播 cards / items / boards 变更，接收端重读 IndexedDB；`visibilitychange` 兜底。
- **主题持久化**：首次访问跟随系统；手动切换后明确写入 `light` / `dark`；首屏内联脚本恢复，避免闪烁。
- **可访问性**：焦点陷阱、`inert` 背景、键盘投放/移动、`aria-live` 选中播报与可见焦点环。
