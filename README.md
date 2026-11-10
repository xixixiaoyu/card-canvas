# Card Canvas

卡片笔记与无限白板工具 · **Phase 08B / Rigid Group**

Phase 01 建立工程、领域模型与双主题；Phase 02 建立无限画布的平移缩放与坐标系；Phase 03 让卡片成为可选中、可拖拽、可落盘的物理实体；Phase 04 打通 **1D 速记 → 2D 白板** 的知识摄入闭环；Phase 05 补齐测试、可访问性、多白板、撤销重做与数据安全；Phase 06 加入低阻力、自动贴边的认知连线系统；Phase 06.5 加入 Spotlight 穿梭搜索、电影感运镜与星系暗化；Phase 07 取消待整理池，速记保存即上板；Phase 07.5 把穿梭扩展到全库跨板检索，并补上标签层级聚合；Phase 08A 加入框选多选、集群包围框与 Markdown 认知蒸馏导出；Phase 08B 把多选升级为 Master 驱动的刚体拖拽、批量连线刷新与单步原子撤销。

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
pnpm test               # Vitest：刚体位移、批量拓扑、原子撤销、框选 AABB、Markdown、连线
pnpm test:e2e           # Playwright：默认 Chromium + 4 workers，全量约 26s
pnpm test:e2e:serial    # 单 worker，调试偶发失败
pnpm test:e2e:chrome    # 系统 Chrome 真浏览器抽查（单 worker）
pnpm build              # typecheck + vite build
pnpm preview
```

本地与 CI 的 E2E 默认使用 Playwright 自带 Chromium，并开启 fullyParallel：本地 4 workers，CI 2 workers。实测系统 Chrome 在多 worker 下会异常放大等待时间（全量从约 1 分钟退化到 5–6 分钟），因此仅保留 `test:e2e:chrome` 作为单 worker 真浏览器抽查。`.github/workflows/ci.yml` 会依次跑格式检查、lint、typecheck、单测、构建与 E2E。

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
- **拖拽死区**：屏幕位移小于 `3px` 视为点击；超过后才进入拖拽态；多选时单击卡片会精准收窄为单选
- **多卡刚体**：从任意已选卡片拖拽，整个选中集群共享同一世界位移，相对间距在任何缩放级别保持不变
- **空格优先**：按住空格时，即使从卡片上起手也进入画布平移，不改动卡片与选中态
- **缩放补偿**：`worldDelta = screenDelta / viewport.scale`，在 30% 与 200% 下光标均与拾起点严格咬合
- **高程反馈**：拾起时 `scale(1.018)`、漫反射阴影增强、`z-index` 置于最上层；放下后平滑回落
- **持久化时机**：拖拽期间只写 DOM transform；`pointerup` 时多卡通过一个 `bulkPut` 事务提交 Pinia，并只记录一条历史

## 即时速记（Capture to Board）

### 保存即上板

- **唤出**：`⌘K` / `⌥N`，或顶栏「速记」按钮
- **字段**：标题、正文、标签（回车 / 逗号添加，`#标签` 在保存时自动解析）
- **保存**：`⌘↵` / `Ctrl ↵`；一次原子操作同时创建 `Card` 与 `BoardItem`，卡片立即选中，弹窗同步关闭，Dexie 事务在后台写入
- **落点**：有选中卡片时，优先放在它右侧（48px 间距），再依次尝试下方 / 左侧 / 上方；没有选中时放在视口中心，中心被占则以 32px 级联在中心附近找位，不跳到远处
- **落位反馈**：新卡片以约 340ms 的轻微下沉 + 缩放动画出现，`prefers-reduced-motion` 下自动关闭
- **撤销**：撤销「速记上板」会同时移除卡片实体与投影；重做一并恢复
- **编辑**：卡片右上角铅笔打开同一弹窗；编辑保持原投影位置，不重新上板
- **没有「待整理池」**：不再存在“未上板”状态，也没有抽屉、Badge 或「移出白板」入口

### 历史数据迁移

- 启动或刷新时，凡是 **没有任何白板投影** 的卡片，会自动放到当前白板右侧的网格中
- 导入备份后同理：新卡片立即落到当前白板已有内容旁，不会变成不可见的孤儿
- 删除白板仍保留卡片实体；这些卡片下一次加载时会迁移到当前白板，避免数据丢失

## 认知连线（Connection Wire）

- **静默**：卡片常态没有任何端口；仅在选中时右侧浮现一个轻量引线把手
- **极速建线**：从把手拖出虚线，掠过目标卡片时出现 Snap Ring；在目标上松手即建线，空白处松手取消
- **自动贴边**：比较两张卡片四条边中点，取距离最近的一对边缘自动吸附；曲线控制点按间距弹性展开
- **可选语义**：双击连线（或选中后按 `Enter`）在线条中点输入关系说明；`Enter` / 失焦保存，`Esc` 取消
- **选择与删除**：点击连线或用 `Tab` 聚焦选中，`Delete` / `Backspace` 删除；所有新增、删除、Label 修改都进入撤销栈
- **级联**：卡片删除时，关联连线同步清理；`⌘Z` 恢复卡片时会一并恢复连线与 Label
- **抗缩放**：连线在卡片拖拽的 rAF 中通过批量事件总线直接更新 SVG `d`，不写 Pinia / Dexie；40% 与 200% 多卡刚体拖拽下内外部端点都保持吸附

## 全局穿梭搜索（Global Spotlight）

- **唤出**：`⌘F` / `Ctrl F` 或 `/`；HUD 右侧也有搜索图标，触屏设备可直接点按
- **数据源**：Dexie 全库 cards + boardItems + boards；当前白板用 Pinia 快照补一层，刚捕获但事务未落盘的卡片也能立即搜到
- **浮层**：居中靠上的磨砂搜索面板；自动聚焦输入框，点击遮罩或 `Esc` 关闭，`Esc` 独占关闭自身
- **检索**：匹配 `title`、`content`、`tags`；多词为 AND，标题命中优先，空查询展示最近卡片
- **结果**：一条结果对应一个**白板投影**；右侧显示来源白板徽标，当前板徽标用暖琥珀强调。同一张卡在多个板上出现时，会如实显示多条
- **键盘**：`↑` / `↓` 切换结果，`Enter` 确认，`Tab` 留在搜索框，`Esc` 退出
- **同板穿梭**：浮层淡出后，400ms `easeOutCubic` 把卡片几何中心对齐视口正中
- **跨板穿梭**：关闭浮层 → 切换白板 → 等待 `board.status === ready` → 等待新 `CanvasStage` 发出 `ready` → 等两帧 → 读取新相机与卡片坐标 → `flyTo` → 选中 + 1.2s 呼吸光环；不会在 DOM 尚未挂载时飞向 `(0, 0)`
- **阅读缩放**：当前缩放低于 50% 或高于 140% 时顺滑回到 100%
- **可打断**：飞行中滚轮、缩放、指针按下或拖拽都会冻结当前视口，把控制权交还用户

## 星系暗化（Galaxy Dimming）

- **层级标签**：以 `/` 分隔的树状标签，父标签会聚合并高亮全部子分支；兄弟分支严格隔离
  - 聚焦 `#心理学` → 命中 `#心理学`、`#心理学/防御机制`、`#心理学/边界`
  - 聚焦 `#心理学/防御机制` → 不命中 `#心理学/边界`
- **聚焦**：点击卡片上的任意标签芯片，把该标签设为 `activeFilterTag`；再次点击同一标签取消
- **背景恢复**：点击空白画布清空选中、标签聚焦与文本选区
- **视觉**：命中卡片保持原样；非命中卡片以 300ms 过渡统一降到 `opacity: 0.15`，缩小白板即可看到概念的宏观星系分布
- **连线保留**：只要连线一端命中该标签就保持清晰；两端都被暗化时，整组连线（含 Label）同步降到 0.15
- **纯前端状态**：`activeFilterTag`、`pulseItemId` 均只驻留 Pinia，不写入 Dexie，不改变表结构

## 框选与多选（Marquee Selection）

- **空白框选**：在纯画布背景按下左键拖拽，半透明琥珀/冷蓝虚线框实时出现
- **世界坐标 AABB**：屏幕框选矩形经 `screenToWorld` 转换后，与 `getItemRect` 实测的世界包围盒相交；10%–300% 缩放不改变判定
- **命中语义**：卡片只要与框选区**相交**就选中，不要求完全包围
- **普通框选**：重置原有选择；**Shift + 框选**：在现有选择上取并集
- **点击语义**：已有多选时，单击其中一张卡片不会在 pointerdown 立刻清空其他选择；如果 pointerup 前没有有效拖拽，才收窄为当前卡片
- **手势优先级**：文本选择 > 引线把手 > 卡片操作 > 卡片拖拽 > 空格/中键画布平移 > 空白框选；框选通过 `setPointerCapture` 保证快速移出视口不丢选区
- **多选状态**：`selectedItemIds: Set<BoardItemId>` 单一真相；卡片、搜索、连接、删除清理都围绕投影 ID，而不是全局 Card ID
- **浮动工具栏**：选中 1 张以上时，在集群上方（空间不足时下方）出现极简胶囊；多选时额外显示虚线外包围框
- **跟随相机**：相机通过 `viewport` 轻量 ref 暴露变换；只有 SelectionChrome 订阅，不把整张画布拖入逐帧深层响应式

## 多卡刚体拖拽（Rigid Group Drag）

- **Master Source**：pointerdown 落在已选卡片上时，只有这张卡注册 `setPointerCapture` 和 window 监听；它计算唯一的世界位移，所有成员共享，不会出现多张卡片争抢事件
- **选择不塌陷**：pointerdown 严格保留完整多选；位移 `≥ 3px` 进入刚体拖拽，拖拽期间与释放后选择集都不变；位移 `< 3px` 的纯点击才收窄为当前卡片
- **世界位移**：`ΔW = ΔS / scale`；所有卡片直接写 `translate3d(ΔWx, ΔWy, 0)` 到 GPU 合成层，不写 Pinia、不写 Dexie
- **刚性视觉**：组拖拽期间禁用单卡 `scale(1.018)` 抬升，避免 Master 卡片在 200% 下产生额外包围盒偏移
- **指针生命周期**：`pointercancel` / `blur` / `lostpointercapture` 都会清理所有卡的 transform 并广播结束；只在 `pointerup` 落盘

## 批量连线与原子撤销

- **`emitCardDragBatch`**：Master 每帧广播一次 `{ items: [{ itemId, cardId, x, y }] }`，不再为每张卡分别 emit
- **拓扑裁剪**：`connectionsTouchingCards` 只保留至少一端在移动集合内的连线；内部连线两端同步，外部连线只有移动端更新
- **单次刷新**：ConnectionLayer 每帧构建一次 `cardId → item` 映射，再遍历受影响连线直接改 `d`；复杂度约为 `O(items + affectedConnections)`，不是 `O(N × Connections)`
- **单步撤销**：拖拽释放调用 `commitItemPositions`，一次 `db.boardItems.bulkPut` 写入全部终点，只压入一条历史「移动 N 张卡片」
- **失败回滚**：`bulkPut` 失败时把所有卡片内存坐标恢复为起点，禁止“部分到终点、部分在起点”的撕裂态

## 认知蒸馏导出（Markdown Synthesis）

- **复制入口**：选中集群后点击胶囊里的「复制 Markdown」
- **阅读顺序**：先按世界 Y 从上到下，Y 差 `80px` 内视为同一行，再按 X 从左到右
- **卡片结构**：`### 标题`、`#标签`、正文、原子笔记列表
- **连线语义**：仅导出**两端都在选中集合内**的 Connection；关系挂在来源卡片下，如
  `> ↳ 关联 [边界不是墙]：底层神经机制相同`
- **剪贴板**：优先 `navigator.clipboard.writeText`；失败时降级到屏幕外 textarea + `execCommand('copy')`，textarea 固定在 `-9999px` 且 `pointer-events:none`
- **反馈**：成功 Toast「已复制 N 张卡片大纲到剪贴板」，工具栏短暂显示「已复制」

> Phase 08B 已完成：多选集群现在可以直接拖拽，连线和撤销都按整个集群处理。

## 键盘与无障碍

- **速记**：`⌘K` / `⌥N` 打开；`Tab` 焦点锁定在弹窗内，背景 `inert`；`Esc` 关闭
- **搜索**：`⌘F` / `/` 或 HUD 搜索按钮打开；`↑` / `↓` 选择，`Enter` 跨板飞往，`Esc` 关闭；输入、编辑或选中文本时不会误触
- **画布卡片**：可聚焦；方向键移动 `10px`，`Shift + 方向键` 移动 `1px`；`Enter` / `Space` 选中
- **多选**：空白处拖拽框选；`Shift` 框选增量；已有多选时单击卡片收窄为单选，拖拽则整组平移
- **连线**：`Tab` 聚焦后选中；`Enter` 编辑说明，`Delete` / `Backspace` 删除
- **撤销 / 重做**：`⌘Z` / `⇧⌘Z`（Windows 支持 `Ctrl+Y`），顶栏也有按钮
- **屏幕阅读器**：选中变化通过 `aria-live` 播报；字符漂移、焦点环、`aria-current` 均已补齐

## 多白板

- 顶栏白板切换器：新建、重命名、切换、两步确认删除
- `boards` 表为 Dexie v2；删除白板级联删除其 `boardItems` 与 `connections`，卡片实体保留
- 每块白板独立保存视口（`localStorage`），刷新/切板后恢复缩放与平移
- Spotlight 检索全库卡片并按投影显示；星系聚焦是局部 UI 状态，切板自动清空
- 卡片实体全局存储，投影属于白板；速记始终落在当前白板
- 删除白板后，保留的卡片若已无任何投影，会在下次加载时迁移到当前白板

## 撤销与数据安全

- 速记上板、移动、编辑、删除、建线/删线/Label 均可撤销/重做（内存历史，最多 50 步）
- 删除为软删除（`Card.isDeleted`），撤销可恢复卡片及其投影
- 顶栏数据菜单可导出/导入完整 JSON 备份（cards / boardItems / connections / boards）；导入按 id 合并
- 启动时申请 `navigator.storage.persist()`；写入失败会回滚并给出可重试 toast

## 本地数据

- 首次启动且 Dexie 为空时自动写入 3 张示例卡片与 3 个空间投影，并创建第一块白板
- 部分数据损坏（投影指向不存在的卡片）会在启动时清理，避免孤儿记录
- 速记在一个 Dexie 事务中写入 `cards` + `boardItems`，不会产生“有卡片、没投影”的中间态
- 编辑只更新 `cards`，实体的 `updatedAt` 不被空间操作污染
- 全量加载在数百张卡片内表现良好；连线为单一 SVG 世界层
- 拖拽期间不写 Dexie，也不做大范围响应式更新

## 目录

```text
src/
├── assets/main.css              # Tailwind、双主题、动态 LOD 点阵、卡片阴影 token
├── components/
│   ├── canvas/
│   │   ├── CanvasStage.vue      # 视口容器、世界层、相机上下文与初始取景
│   │   ├── CanvasHUD.vue        # 缩放 / 居中悬浮胶囊
│   │   ├── CardNode.vue         # 世界卡片、拖拽手柄、标签与呼吸光环
│   │   ├── SelectionChrome.vue  # 多选包围框、浮动工具栏与 Markdown 复制
│   │   ├── ConnectionLayer.vue  # SVG 连线层、命中路径、Label 胶囊
│   │   └── SpotlightSearch.vue  # 全局搜索浮层、白板徽标与键盘导航
│   ├── board/
│   │   └── BoardSwitcher.vue    # 多白板新建 / 重命名 / 切换 / 删除
│   ├── capture/
│   │   └── QuickCapture.vue     # 速记 / 编辑弹窗、焦点陷阱、空白槽位选址
│   └── ui/
│       ├── DataMenu.vue         # 工作区备份导出 / 导入
│       └── ToastStack.vue       # 错误 / 成功提示与重试
├── composables/
│   ├── useCanvas.ts             # 相机、锚点缩放、坐标换算、手势状态机
│   ├── useCardDrag.ts           # 单卡/刚体组拖拽、死区、缩放补偿、Master Source
│   ├── useConnection.ts         # 引线拖拽状态机、目标命中、键盘操作
│   ├── useMarqueeSelect.ts      # 空白框选、世界 AABB、Shift 并集与 pointer capture
│   └── useTheme.ts              # useDark + useToggle 主题管理
├── data/seed.ts                 # 首次启动示例数据
├── db/index.ts                  # Dexie 单例（v2：boards 表）
├── lib/
│   ├── backup.ts                # 全量导出 / 导入与校验
│   ├── card-drag-bus.ts         # 批量拖拽帧事件 → 连线一次刷新
│   ├── drag-topology.ts         # 受影响的内部/外部连线裁剪
│   ├── group-drag.ts            # 统一世界位移与刚体位置计算
│   ├── capture-placement.ts     # 选中卡片旁 / 中心级联的落点规则
│   ├── card-metrics.ts          # 实测卡片世界高度 / 包围盒
│   ├── galaxy.ts                # 层级标签命中与连线暗化规则
│   ├── global-search.ts         # 全库投影索引、白板徽标与结果排序
│   ├── geometry.ts              # 边缘中点匹配、贝塞尔、Label 中点
│   ├── markdownExport.ts        # 阅读顺序、连线语义与剪贴板降级
│   ├── selection.ts             # 世界坐标 AABB 框选几何
│   ├── plain-record.ts          # 响应式对象 → Dexie/搜索索引的安全快照
│   ├── spotlight-search.ts      # 标题/正文/标签本地搜索与排序
│   ├── tab-sync.ts              # BroadcastChannel 跨标签页同步
│   ├── tags.ts                  # 标签归一化 / 解析 / 合并
│   └── view-state.ts            # 每块白板的视口持久化
├── stores/
│   ├── board.ts                 # 卡片、投影、连线、历史栈、跨标签同步
│   ├── toast.ts                 # 瞬时提示队列
│   └── workspace.ts             # 白板列表 / 当前白板
├── types/index.ts               # Card / Board / BoardItem / Viewport / Connection
├── App.vue                      # 启动、画布、卡片与屏幕 UI
└── main.ts                      # 应用入口（挂载 Pinia）

tests/                           # Vitest 单元测试
e2e/                             # Playwright 端到端测试
```

## 架构约定

- **实体与投影解耦**：`Card` 是内容实体，`BoardItem` 是该卡片在某块白板上的世界坐标投影。
- **坐标换算**：`useCanvas.ts` 导出纯函数 `screenToWorld` / `worldToScreen` / `viewportForWorldCenter`；`useCanvas()` 返回绑定实时相机的二参数版本，并通过 provide/inject 暴露给世界卡片。
- **运镜力学**：`flyTo` 用 `viewportForWorldCenter` 把世界点放到容器中心，rAF + `easeOutCubic` 同步插值 pan/scale；任何滚轮或指针主动操作都会 `freezeMotion()` 并 resolve 飞行 Promise。
- **跨板 hydration 握手**：App 维护 `stageReady` 与 `pendingTeleport`，切板后必须等 board ready + 新 CanvasStage `ready` + 两帧，再用新相机读取实测坐标；搜索组件只负责选择目标，不直接切板或飞旧相机。
- **全局索引边界**：`global-search.ts` 只读取 `plainRecord` 快照；一个结果对应一个 `BoardItem` 投影，同一卡片多板放置会显示多条并带白板徽标。
- **层级标签单一真相**：`tagMatches` 同时被卡片暗化、标签选中态和连线判断复用，避免三处各写一套前缀规则。
- **搜索与聚焦**：`spotlight-search.ts` 是纯函数检索；`galaxy.ts` 只回答“卡片是否命中标签 / 连线是否两端都暗化”，视图层不复制规则。
- **选中真相**：`selectedItemIds` 是唯一的选中集合；`selectedItemId` 仅为单选兼容派生值，避免多选与跨板搜索互相覆盖。
- **刚体来源**：只有 Master Source 计算指针世界位移，组内其他卡只消费同一个 delta，因此相对间距不可能因逐卡计算而漂移。
- **框选轴性**：框选起点/终点先转成世界坐标，再用 `getItemRect` 的动态高度做 AABB；不读屏幕像素或静态 item.height。
- **捕获即上板**：`captureAndPlace` 在一个动作里创建 `Card` + `BoardItem`，只记录一条历史；卡片实体不携带 `boardId` 或坐标。
- **落点选址**：纯函数 `capture-placement.ts` 负责“选中卡片右侧优先 → 下 / 左 / 上 → 中心 32px 级联”的确定性规则；无投影的历史卡片在加载/刷新时自动迁移到当前白板右侧。
- **乐观写入**：速记先把卡片与投影发布到 Pinia（UI 立即关闭、卡片立即选中），再异步事务写 `cards` + `boardItems`；失败时同时回滚两者并恢复草稿。
- **绝对不动点缩放**：缩放动画每一帧都以固定世界锚点重算 pan，而非只在 wheel 事件里计算一次。
- **性能隔离**：卡片拖拽期间使用普通对象 + rAF + 直接 DOM transform；多卡在 `pointerup` 提交一次 Pinia 与一次 `bulkPut`，只记录一条历史。
- **连线同轴**：SVG 直接挂在 World Layer；端点/控制点全部基于世界坐标，不在 SVG 层重复折算 scale；命中路径 20px、视觉线 1.5px 并使用 `non-scaling-stroke`。
- **连线的动静分离**：拖拽卡片时通过 `card-drag-bus` 批量推送世界坐标，SVG 层每个 rAF 只刷新受影响连线；拖拽期间不写 Dexie、不触发深层响应式。
- **响应式 → Dexie 边界**：所有写入前通过 `plainRecord` 深拷贝，避免把 Vue Proxy 交给 IndexedDB 结构化克隆。
- **历史栈**：每个用户动作记录 `{ label, undo, redo }` 闭包，内存最多 50 步；撤销/重做本身不再入栈。
- **跨标签页**：`BroadcastChannel` 广播 cards / items / connections / boards 变更，接收端重读 IndexedDB；`visibilitychange` 兜底。
- **主题持久化**：首次访问跟随系统；手动切换后明确写入 `light` / `dark`；首屏内联脚本恢复，避免闪烁。
- **可访问性**：焦点陷阱、`inert` 背景、键盘移动、连线 `Tab` 聚焦、搜索 `role=listbox` + `aria-selected`、`aria-live` 选中播报与可见焦点环。
