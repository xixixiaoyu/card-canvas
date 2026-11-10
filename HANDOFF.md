# Card Canvas v1.0.0 交接文档

> 面向接手 Agent 的执行手册。  
> 最后核对：2026-11-10  
> 仓库：`/Users/yunmu/Desktop/card-canvas`  
> 分支：`main`  
> 发布提交：`a863886`  
> 发布标签：`v1.0.0`  
> 当前状态：v1.0.0 已封版，工作区干净，`main` 与 `origin/main` 同步。

---

## 0. 一页速览

Card Canvas 是一个 **Local-First 的原子卡片 + 2D 无限白板** 工具。它不是文档编辑器，也不是聊天应用；核心闭环是：

```text
速记捕获 → 卡片直接落在白板 → 空间排列/连线 → 标签聚焦/全局穿梭 → 选中导出 Markdown
```

| 项目        | 当前值                                              |
| ----------- | --------------------------------------------------- |
| 版本        | `1.0.0`                                             |
| 提交 / 标签 | `a863886` / `v1.0.0`                                |
| 前端        | Vue 3.5 + TypeScript + Vite 8                       |
| 样式        | Tailwind 3.4，`darkMode: 'class'`                   |
| 状态        | Pinia                                               |
| 持久化      | Dexie 4 / IndexedDB，DB 名 `card-canvas`，schema v2 |
| 单测        | 17 个文件，93 项 Vitest 全绿                        |
| E2E         | 14 个文件，28 项 Playwright 全绿                    |
| E2E 速度    | 本地 Chromium + 4 workers + fullyParallel，约 33 秒 |
| CI          | `.github/workflows/ci.yml`：quality + E2E 两个 job  |
| 本地服务    | `http://localhost:5199`                             |
| PWA         | manifest + 元信息；**没有 Service Worker**          |
| 图表/服务端 | 无服务端、无账号、无云同步                          |

### 最重要的五条底线

1. **不要改 Dexie schema**，除非同时写 `db.version(3)` 的 migration、备份 parser 和迁移测试。v1.0.0 冻结 schema v2。
2. **`selectedItemIds` 是唯一多选真相**。`selectedItemId` 只是单选取值；不要写它，也不要把它当多选状态。
3. **所有写入 Dexie 的对象必须过 `plainRecord`**，禁止把 Vue Proxy 交给 IndexedDB。
4. **拖拽热路径不写 Pinia/Dexie**。只在 `pointerup` 做一次批量提交；多卡必须是一条历史。
5. **视觉效果依赖真实 DOM 测量**。卡片高度用 `getItemRect` / `card-metrics`，不要用 `BoardItem` 上不存在的 `height`。

### 最短启动

```bash
cd /Users/yunmu/Desktop/card-canvas
git status
pnpm install
pnpm test
pnpm dev                 # http://localhost:5199
```

E2E：

```bash
pnpm test:e2e            # 默认 Playwright Chromium + 4 workers
pnpm test:e2e:serial     # 单 worker，定位偶发失败
pnpm test:e2e:chrome     # 系统 Chrome 真浏览器抽查，强制单 worker
```

如果 5199 已经有正确的 Card Canvas dev server，Playwright 会复用；不要无脑再起第二个同端口服务。

---

## 1. 接手 Agent 开工清单

按顺序执行：

1. `pwd`，确认工作目录是 `/Users/yunmu/Desktop/card-canvas`。
2. `git status --short --branch`，确认干净、在 `main`。
3. `git log --oneline -5`，确认 HEAD 至少包含 `a863886 release: card canvas v1.0.0`。
4. `git tag --points-at HEAD`，确认 `v1.0.0`。
5. `pnpm install`。
6. `pnpm test`，预期 93 passing。
7. 如果改动只涉及一个 E2E，先跑目标文件，再跑全量。
8. 修改前先读本文件第 5–9 节；不要先改 UI，再回头补数据契约。

### 绝对不要做的事

- 不要直接修改 `dist/`。它是构建产物，已被 `.gitignore` 忽略。
- 不要提交 `shots/`、`test-results/`、`playwright-report/`；这些都被忽略。
- 不要为了“功能方便”把 `Card` 加上 `boardId`、`x`、`y`。空间投影必须继续在 `BoardItem` 上。
- 不要在 `CardNode` 内直接写 Dexie。
- 不要在拖拽每帧调用 `db.boardItems.update`。
- 不要把 `selectedItemId` 改成可写 ref。
- 不要让 `App.vue` 订阅每一帧的 `camera.viewport`；只有 SelectionChrome 需要。
- 不要在输入框/编辑器里劫持 `?`、`/`、`⌘K`。
- 不要用系统 Chrome 跑多 worker E2E；本机已验证会从约 30 秒退化为 5–6 分钟。

---

## 2. 产品定位与设计意图

### 2.1 目标用户

跨学科探索者、研究者、写作者、设计师、需要把碎片思考摊开再收束的人。

### 2.2 核心闭环

1. **捕获**：`⌘K` 打开速记，保存即上板。
2. **漫游**：平移/缩放白板，用空间位置保留记忆。
3. **组织**：框选、Shift 并集、刚体多卡平移。
4. **牵引**：从卡片边缘拖出连线，可写语义标签。
5. **检索**：`⌘F` 全库穿梭；`/` 当前板搜索。
6. **收束**：标签层级聚焦形成“星系”；选中集群复制 Markdown 大纲。

### 2.3 设计哲学

- **拒绝长篇大论**：卡片先于文档，一张卡只承载一个原子观点。
- **捕获即上板**：没有“待整理池”，没有“先收件箱再整理”的二段式。
- **实体与投影解耦**：内容属于 Card，位置属于 BoardItem。
- **贴身生长**：新卡优先落在当前选中卡旁边，中心被占时做 32px 级联，而不是跳到远处。
- **克制视觉**：特种纸、细线、噪点、低饱和琥珀强调；避免仪表盘和高饱和大色块。
- **本地优先**：没有服务端；数据在浏览器 IndexedDB。
- **可解释力学**：框选、连线、刚体位移、撤销都有纯函数和测试，不靠肉眼调参。

### 2.4 明确非目标

- 不是长文档编辑器。
- 不是实时多人协作工具。
- 不做云同步 / 账号体系。
- 不引入重型图形引擎（Canvas/WebGL 场景图）替换 DOM 卡片。
- 不在 v1.0.x 做 Dexie schema 大变。

---

## 3. 用户可见能力地图

### 3.1 即时捕获

- `⌘K` / `Ctrl K`：打开速记。
- `⌥N` / `Alt N`：备用速记入口。
- 速记弹窗内 `⌘↵` / `Ctrl Enter`：保存。
- 卡片保存后立即进入白板，默认选中。
- 有选中卡片时优先落在右侧 48px 处；再尝试下、左、上；都不可用则中心 32px 级联。
- 编辑卡片复用同一弹窗，不重新上板。
- 删除是软删除；撤销恢复卡片及投影。

### 3.2 画布漫游

- 触控板双指滑动：平移。
- 触控板捏合 / `Ctrl + 滚轮`：以光标为锚点缩放。
- `Space + 左键拖拽`：平移。
- 鼠标中键拖拽：平移。
- HUD：缩小、放大、重置 100%、居中全部卡片、搜索、快捷键帮助。
- 缩放范围 10%–300%。
- 每块白板独立持久化视口到 localStorage。

### 3.3 卡片

- 点击：单选；主题化选中环。
- 点击空白：清空选中、标签聚焦和文本选区。
- 拖拽：标题、右上角 grip、留白、底栏均可起手。
- 正文和原子笔记文字可选择；标签、按钮内部交互不会误触拖拽。
- 屏幕位移 `< 3px` 是点击，`≥ 3px` 是拖拽。
- 多选时 pointerdown 不塌陷；如果最终是纯点击，才收窄为当前卡片。

### 3.4 多选 / 框选

- 空白处左键拖拽：世界坐标 AABB 框选。
- 框选相交即命中。
- 普通框选重置选择；`Shift + 框选` 并集。
- 已选集群显示虚线包围框和浮动胶囊。
- 浮动胶囊有「复制 Markdown」。
- 相机平移/缩放时，工具栏和包围框跟随；只有 SelectionChrome 订阅 viewport。

### 3.5 多卡刚体拖拽

- 从任意已选卡片拖拽，所有选中卡片共享同一世界位移。
- Master Source 是唯一 pointer capture / window listener 持有者。
- 世界位移 `ΔW = ΔS / scale`。
- 每帧直接写 DOM `translate3d`，不写 Pinia/Dexie。
- 组拖时禁用单卡 `scale(1.018)` 抬升，避免高倍缩放下包围盒漂移。
- `pointerup` 原子落盘：一次 `db.boardItems.bulkPut`，一条历史「移动 N 张卡片」。
- `pointercancel` / `blur` / `lostpointercapture` 会清理状态。

### 3.6 认知连线

- 仅选中卡片显示右侧引线把手。
- 从把手拖出虚线，掠过目标出现 Snap Ring。
- 松手建线；空白取消。
- 自动选择两卡四条边中点距离最近的一对，控制点按间距展开。
- 双击线（或选中后 Enter）编辑关系说明。
- `Delete` / `Backspace` 删除；`Tab` 聚焦连线。
- 删除卡片级联删除相关连线；撤销恢复。
- 拖拽卡片时 SVG 线实时跟随，不写响应式状态。

### 3.7 全局穿梭 / Spotlight

- `⌘F` / `Ctrl F` 或 `/` 打开搜索。
- HUD 搜索按钮也可打开。
- 搜索全库 `cards + boardItems + boards`，当前板用 Pinia 快照补齐刚捕获的卡片。
- 一个结果对应一个白板投影；显示白板徽标。
- `↑` / `↓` 选择，`Enter` 前往，`Esc` 关闭。
- 同板：400ms `easeOutCubic` 飞向卡片几何中心。
- 跨板：切板 → 等 board ready → 等 CanvasStage ready → 两帧 → 读新相机 → 飞行。
- 低/高缩放（<50% 或 >140%）回到 100%。
- 滚轮/缩放/指针操作可打断飞行。

### 3.8 层级星系

- 标签用 `/` 表示层级：`#心理学/防御机制`。
- 点击标签设置 `activeFilterTag`；再点取消。
- 父标签命中全部子分支；兄弟分支隔离。
- 非命中卡片 opacity 0.15。
- 连线只要一端命中就保持清晰；两端都暗才暗。
- 纯 Pinia UI 状态，不写 Dexie。

### 3.9 Markdown 蒸馏

- 选中 1 张以上，点击浮动胶囊「复制 Markdown」。
- 阅读顺序：Y 升序；同一行容差 80px；行内 X 升序。
- 卡片输出：`### 标题`、`#标签`、正文、原子笔记列表。
- 仅导出两端都在选中集合内的 Connection。
- 关系挂在来源卡片下：
  `> ↳ 关联 [目标标题]：关系说明`
- 优先 `navigator.clipboard.writeText`，失败降级屏幕外 textarea + `execCommand`。
- 成功 Toast：`已复制 N 张卡片大纲到剪贴板。`

### 3.10 快捷键与空板

- `?`：快捷键备忘录；`Esc` / 遮罩关闭。
- HUD 右侧 `?` 图标：触屏入口。
- 输入框、textarea、select、contenteditable、`role=textbox` 内输入问号不会触发。
- 空板（当前 `board.entries.length === 0`）显示「空白也是一块画布」。
- 点击空状态或 `⌘K` 进入速记；首卡出现后空状态淡出。

### 3.11 主题 / 版本 / PWA

- 首次访问跟随系统；手动切换持久化 `card-canvas-theme`。
- `index.html` 首屏内联脚本避免主题闪烁。
- 版本 `v1.0.0` 出现在顶栏、页脚、数据菜单、快捷键浮层。
- `public/manifest.webmanifest` 提供 standalone、主题色、SVG 图标。
- 当前**没有 Service Worker**，不承诺离线缓存。

---

## 4. 完整快捷键表

| 区域 | 按键                   | 行为                       |
| ---- | ---------------------- | -------------------------- |
| 捕获 | `⌘K` / `Ctrl K`        | 打开速记                   |
| 捕获 | `⌥N` / `Alt N`         | 备用速记                   |
| 捕获 | `⌘↵` / `Ctrl Enter`    | 保存速记                   |
| 捕获 | `Esc`                  | 关闭速记 / 取消            |
| 漫游 | `Space + 左键拖拽`     | 平移画布                   |
| 漫游 | 鼠标中键拖拽           | 平移画布                   |
| 漫游 | 滚轮 / 捏合            | 缩放                       |
| 漫游 | `Shift + 空白拖拽`     | 框选并集                   |
| 检索 | `⌘F` / `Ctrl F`        | 全局穿梭                   |
| 检索 | `/`                    | 当前板搜索（无文本选区时） |
| 检索 | `↑` / `↓`              | Spotlight 选择             |
| 检索 | `Enter`                | 前往结果 / 编辑连线标签    |
| 组织 | 拖动已选卡片           | 刚体组平移                 |
| 组织 | 点击已选多选中的卡     | 收窄为单选                 |
| 组织 | `⌘Z` / `Ctrl Z`        | 撤销                       |
| 组织 | `⇧⌘Z` / `Ctrl Shift Z` | 重做                       |
| 组织 | `Ctrl Y`               | Windows 重做               |
| 帮助 | `?`                    | 快捷键备忘录               |
| 帮助 | `Esc`                  | 关闭浮层                   |
| 卡片 | 方向键                 | 移动 10px                  |
| 卡片 | `Shift + 方向键`       | 移动 1px                   |
| 卡片 | `Enter` / `Space`      | 选中卡片                   |
| 连线 | `Tab`                  | 聚焦连线                   |
| 连线 | `Delete` / `Backspace` | 删除连线                   |

输入保护的事实来源：`App.vue` 的 `isEditableTarget()`。  
快捷键浮层自己的 `Esc` / `Tab` 监听在 `ShortcutModal.vue`，打开时 App 会提前 return，不抢键。

---

## 5. 领域模型

定义在 [src/types/index.ts](src/types/index.ts)：

```ts
interface Card {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
  isDeleted?: boolean
  highlights?: CardHighlight[]
}

interface BoardItem {
  id: string
  cardId: string
  boardId: string
  x: number
  y: number
  width?: number
  color?: string
}

interface Board {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

interface Connection {
  id: string
  boardId: string
  fromCardId: string
  toCardId: string
  label?: string
}

interface Viewport {
  panX: number
  panY: number
  scale: number
}
```

### 5.1 关键不变量

1. **Card 是全局内容实体**：没有 `boardId`、`x`、`y`。
2. **BoardItem 是空间投影**：同一张 Card 可以在不同 Board 上出现；每块板最多一个投影（`placeCard` 会拒绝同板重复）。
3. **Board 只是投影集合**：切板不复制内容；删除 Board 保留 Card 实体，只级联删除该板的 BoardItem / Connection。
4. **软删除**：`Card.isDeleted = true`；UI 过滤；撤销恢复。
5. **卡片高度不持久化**：内容驱动，由 `card-metrics.ts` 记忆实测高度；`getItemRect` 提供世界 bounds 和保守 fallback。
6. **Connection 是 board 级的**：`fromCardId` / `toCardId` 指向 Card，`boardId` 指向 Board。
7. **投影 ID 是选择真相**：选择、框选、组拖、Toolbar 都用 BoardItem ID，而不是 Card ID。

### 5.2 启动数据

- 空 DB 首次启动写入 3 张 seed card + 3 个 projection + 默认白板「我的白板」。
- seed 在 [src/data/seed.ts](src/data/seed.ts)。
- 固定焦点投影：`FOCUS_BOARD_ITEM_ID = 'projection-001'`，小屏初始取景会用它。
- 测试清空 DB 后，`board.initialize` 会重新 seed。

---

## 6. 数据层 / Dexie

文件：[src/db/index.ts](src/db/index.ts)

```ts
super('card-canvas')

this.version(1).stores({
  cards: 'id, *tags, updatedAt, isDeleted',
  boardItems: 'id, cardId, boardId',
  connections: 'id, boardId, fromCardId, toCardId',
})

this.version(2).stores({
  boards: 'id, updatedAt',
})
```

### 6.1 表

| 表            | 主键 | 关键索引                            | 内容         |
| ------------- | ---- | ----------------------------------- | ------------ |
| `cards`       | `id` | `*tags`, `updatedAt`, `isDeleted`   | 全局内容实体 |
| `boardItems`  | `id` | `cardId`, `boardId`                 | 空间投影     |
| `connections` | `id` | `boardId`, `fromCardId`, `toCardId` | 连线         |
| `boards`      | `id` | `updatedAt`                         | 白板元数据   |

### 6.2 写入规则

- 所有 store → Dexie 写入前必须 `plainRecord()`（[src/lib/plain-record.ts](src/lib/plain-record.ts)）。
- 速记保存：`cards` + `boardItems` 在一个事务中写入；失败回滚两者。
- 单卡拖拽：`db.boardItems.update`。
- 多卡拖拽：`db.transaction('rw', db.boardItems)` + `bulkPut` 全部终点；失败恢复全部内存坐标。
- 连线新增/删除/Label：都进入历史。
- 导入备份：全量写入后重载 boards / board；见 `src/lib/backup.ts`。

### 6.3 历史

在 [src/stores/board.ts](src/stores/board.ts)：

```ts
interface HistoryEntry {
  id: string
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}
```

- 内存历史，最多 **50** 步。
- 切板时清空。
- 撤销/重做本身不 record。
- 每次用户可见 mutation 应该只 record 一次。
- 多卡拖拽必须只 record 一条 `移动 N 张卡片`。

### 6.4 本地 UI 状态

| key                              | 存储         | 说明                           |
| -------------------------------- | ------------ | ------------------------------ |
| `card-canvas:active-board`       | localStorage | 当前白板 ID                    |
| `card-canvas:viewport:<boardId>` | localStorage | `panX/panY/scale/width/height` |
| `card-canvas-theme`              | localStorage | `light` / `dark`               |
| `activeFilterTag`                | Pinia        | 不持久化                       |
| `pulseItemId`                    | Pinia        | 不持久化                       |
| `selectedItemIds`                | Pinia        | 不持久化                       |
| 历史栈                           | Pinia        | 不持久化                       |

### 6.5 跨标签同步

[src/lib/tab-sync.ts](src/lib/tab-sync.ts)

- BroadcastChannel：`card-canvas:workspace`。
- 类型：`cards | items | connections | boards | all`。
- 发送端带 `sourceId`，自身消息会被忽略。
- 接收端 80ms debounce 后重读 IndexedDB。
- `visibilitychange` 兜底 refresh。

### 6.6 备份

[src/lib/backup.ts](src/lib/backup.ts)

```ts
{
  app: 'card-canvas',
  version: 1,
  exportedAt: string,
  cards: Card[],
  boardItems: BoardItem[],
  connections: Connection[],
  boards: Board[]
}
```

- 导入按 id 合并（`bulkPut`）。
- 备份 parser 对每个字段做显式校验；新增字段/表时必须同步改 parser。
- 数据菜单入口：[src/components/ui/DataMenu.vue](src/components/ui/DataMenu.vue)。

---

## 7. Pinia Store 契约

### 7.1 Board store

文件：[src/stores/board.ts](src/stores/board.ts)

暴露状态：

```ts
cards
items
connections
entries // { item, card } 的派生渲染列表
selectedItemIds // Set<string>，唯一多选真相
selectedItemId // 单选派生值；多选时为 null；只读
selectedItems // BoardItem[]
selectedItem // 第一个选中项（兼容属性）
landingItemId
activeFilterTag
pulseItemId
selectedConnectionId
selectedConnection
status // idle | loading | ready | error
error
isHydrated
activeBoardId
canUndo / canRedo
undoLabel / redoLabel
```

关键方法：

| 方法                                        | 语义                                             |
| ------------------------------------------- | ------------------------------------------------ |
| `initialize(boardId)`                       | 打开 DB、seed、loadBoard                         |
| `loadBoard(boardId)`                        | 读当前板 cards/items/connections，清空选择和历史 |
| `refresh()`                                 | 从 DB 重读当前板                                 |
| `startSync()` / `stopSync()`                | BroadcastChannel + visibilitychange              |
| `selectItem(id)`                            | 单选；清空连线选择                               |
| `selectItems(ids)`                          | 多选；只保留有效 itemId；清空连线选择            |
| `selectConnection(id)`                      | 连线单选；清空 item 选择                         |
| `clearSelection()`                          | 清空两者                                         |
| `toggleFilterTag(tag)` / `clearFilterTag()` | 星系聚焦                                         |
| `pulseItem(id)`                             | 搜索到达的呼吸光环                               |
| `commitItemPosition(id,x,y)`                | 单卡落盘 + 单条历史                              |
| `commitItemPositions(positions)`            | 多卡原子 `bulkPut` + 一条历史                    |
| `nudgeItem(id,dx,dy)`                       | 键盘移动                                         |
| `captureCard(input)`                        | 只创建 Card，无投影                              |
| `updateCard(id, patch)`                     | 更新内容，保留位置                               |
| `placeCard(cardId, boardId, pos)`           | 创建投影；同板重复返回 null                      |
| `captureAndPlace(input, boardId, pos)`      | 原子创建 Card + BoardItem                        |
| `deleteCard(cardId)`                        | 软删除 + 级联连线                                |
| `createConnection(from,to)`                 | 建线；重复/自连拒绝                              |
| `deleteConnection(id)`                      | 删线                                             |
| `updateConnectionLabel(id,label)`           | 改标签                                           |
| `undo()` / `redo()` / `clearHistory()`      | 历史                                             |

### 7.2 Selection 语义

```ts
selectItems(ids)
// 1. 过滤掉不存在的 BoardItem ID
// 2. 替换整个 Set（不要原地 mutate）
// 3. selectedConnectionId = null
```

重要：

- `selectedItemIds` 是 `ref<Set<string>>`，通过**替换 Set**触发响应式。
- `selectedItemId` 是 computed：只有 size === 1 才返回值。
- 不要把 `selectedItemId` 当作多选状态。
- 选中、删除、刷新、撤销都要清理失效 item ID；见 `pruneSelectedItems()` / `removeSelectedItem()`。

### 7.3 Workspace store

文件：[src/stores/workspace.ts](src/stores/workspace.ts)

- `boards`、`activeBoardId`、`activeBoardName`、`status`。
- `loadBoards` / `switchBoard` / `createBoard` / `renameBoard` / `deleteBoard`。
- `deleteBoard` 在一个事务里删除 boards + boardItems + connections；保留 Card。
- `selectedCardId` 是遗留字段，目前 UI 几乎未使用；不要把它作为新选择真相。
- 默认板 ID `board-main`，默认名「我的白板」。

### 7.4 Toast

[src/stores/toast.ts](src/stores/toast.ts)

- `toast.push(message, { tone, timeout, action })`。
- 失败写入通常给出可重试 action。
- Toast z-index 90，高于快捷键浮层。

---

## 8. 画布 / 相机 / 覆盖层

### 8.1 CanvasStage 职责

[src/components/canvas/CanvasStage.vue](src/components/canvas/CanvasStage.vue)

- 持有 `stageEl`、`worldEl`、`gridEl`。
- 调 `useCanvas()`，得到相机、缩放、平移、fit、flyTo、screen/world 转换。
- `provide(canvasCameraKey, cameraApi)`。
- `useConnection()`，`provide(connectionKey, connection)`。
- `useMarqueeSelect()`。
- 初始：恢复 localStorage viewport；尺寸变化过大或小于 1100/高度 680 时用 `[data-canvas-focus]`；否则 fitAll。
- `<slot />` 是 World Layer 内部，卡片/连线在这里。
- `<slot name="overlay" />` 是屏幕层，App 的 header/footer/空状态在这里。
- HUD 在 CanvasStage 内底部。

### 8.2 坐标 API

[src/composables/useCanvas.ts](src/composables/useCanvas.ts)

```ts
screenToWorld(point, containerRect?) -> world
worldToScreen(point, containerRect?) -> screen
getViewport() -> { panX, panY, scale }
getContainerRect() -> DOMRect | null
flyTo(worldX, worldY, scale?, duration?) -> Promise<void>
fitToContent(...)
focusElement(selector, options)
restoreViewport(saved)
```

- `viewport` 是 `shallowRef`，每次 `applyTransform` 更新。
- **只有 SelectionChrome 消费 `viewport`**，避免 App 每帧 render。
- `CanvasCamera` 接口还包含 `isSpaceHeld`。
- 缩放范围 0.1–3。

### 8.3 覆盖层 / z-index 参考

| 层                        |                     大约 z-index | 说明                |
| ------------------------- | -------------------------------: | ------------------- |
| World items               | 0 / selected 100 / dragging 1000 | 卡片                |
| Empty state               |                 10（overlay 内） | 空白引导            |
| Header / footer / overlay |                               20 | 顶栏、页脚          |
| HUD dock                  |                               30 | 缩放胶囊            |
| SelectionChrome           |                               35 | 包围框 + 浮动工具栏 |
| Marquee box               |                               25 | 框选框              |
| DataMenu / BoardSwitcher  |                               50 | 菜单                |
| Spotlight                 |                               80 | 搜索                |
| ShortcutModal             |                               85 | 快捷键浮层          |
| Toast                     |                               90 | 瞬时提示            |

新增屏幕 UI 时：

- 加 `data-canvas-ui`，让框选/空白手势排除它。
- 交互容器加 `@pointerdown.stop`。
- 若是浮层，确保 `Esc` 不被 App 抢走：可在组件 window listener 中 `stopImmediatePropagation()`。
- 输入控件必须被 `isEditableTarget` 识别，避免全局快捷键误触。

### 8.4 指针优先级

```text
文本选择
  > 引线把手 / 卡片按钮
  > 卡片拖拽
  > 空格 / 中键画布平移
  > 空白框选
```

- `CardNode` 用 `data-card-selectable` / `data-card-interactive` 标记内部区域。
- `useCardDrag` 默认 `ignoreSelector` 包含这两个。
- `CanvasStage` 的空白 pointerdown 只在鼠标左键、非空格、非触控平移时开始框选。
- 触摸空白点击会清空选择，但不启动框选。

---

## 9. 核心力学与实现细节

### 9.1 Card drag（单卡 + 组）

文件：[src/composables/useCardDrag.ts](src/composables/useCardDrag.ts)

关键状态/行为：

- `DRAG_THRESHOLD = 3`。
- `activePointerId` 只能有一个。
- pointerdown：
  - 空格时直接 return；
  - 内部交互只处理选择，不启动拖拽；
  - `onSelect` 在启动拖拽前调用；
  - 取 `getGroupItems()`；只有被选中的 source 且在组内才成组。
- Master Source 只有 pointer capture + window listeners。
- 每帧：
  - 计算 source 世界坐标；
  - `delta = latest - start`；
  - 给所有组员 `style.transform = translate3d(delta.x,delta.y,0)`；
  - `emitCardDragBatch({ items: 绝对世界坐标 })`。
- 组拖：
  - `isGroupDragging` 为 true；
  - CardNode 加 `is-group-dragging`，CSS 将 `.card-lift` 的 `scale(1.018)` 置空；
  - 仅 source 加 `is-dragging`。
- pointerup：
  - 未过阈值：`onClick` → App 可能收窄选择；
  - 过阈值：计算最终坐标；组用 `onCommitGroup`；单卡用 `onCommit`；
  - `await nextTick()` 后清理所有 transform；
  - `emitCardDragEndBatch`；
  - `isGroupDragging = false`。
- 取消/失焦：清 transform、发 end batch、重置状态。

**不要** 把组位移拆成每张卡各自从 pointer 计算；这必然在高倍缩放下漂移。

### 9.2 Batch bus

[src/lib/card-drag-bus.ts](src/lib/card-drag-bus.ts)

```ts
emitCardDragBatch({ items: CardDragPositionEvent[] })
emitCardDragEndBatch({ items: CardDragEndEvent[] })
subscribeCardDragBatch(listener)
subscribeCardDragEndBatch(listener)
```

- 事件里是**绝对世界坐标**，不是 delta。
- 一次 group 拖拽每帧只发一个 batch。
- 任何新的拖拽相关消费者都应该订阅 batch，不要恢复单卡事件。
- SelectionChrome 用 batch 更新 live positions 与包围框。
- ConnectionLayer 用 batch 一次更新受影响连线。

### 9.3 ConnectionLayer

[src/components/canvas/ConnectionLayer.vue](src/components/canvas/ConnectionLayer.vue)

- SVG 直接在世界层，世界坐标 + `non-scaling-stroke`。
- `rendered` computed：基础路径。
- 拖拽中不依赖 computed，直接改 `d`：
  - 构建 `cardId -> item` 映射一次；
  - `connectionsTouchingCards(connections, movingCardIds)`；
  - 对每条受影响线，从 `livePositions` / `getItemRect` 重算 geometry；
  - 更新 path / start/end dot / label 位置。
- 内部连线两端都动；外部连线只动一端。
- 拓扑裁剪在 [src/lib/drag-topology.ts](src/lib/drag-topology.ts)。

### 9.4 刚体落盘 / 原子撤销

[src/stores/board.ts](src/stores/board.ts) `commitItemPositions`

1. 过滤无效坐标。
2. 去重 itemId。
3. 过滤不存在或坐标未变化的 item。
4. 生成 before/after 完整 plain 记录。
5. 本地先替换所有 item（视觉立即到终点）。
6. `db.transaction('rw', db.boardItems)` + `bulkPut(after)`。
7. 失败：恢复所有 before，Toast 重试，返回 false。
8. 成功：record 一条 `移动 N 张卡片`。
9. undo/redo 都整组 `bulkPut`。
10. 广播 `items`。

单卡 `commitItemPosition` 仍保留，用于单卡拖拽/键盘 nudge 等。

### 9.5 框选

[src/lib/selection.ts](src/lib/selection.ts) + [src/composables/useMarqueeSelect.ts](src/composables/useMarqueeSelect.ts)

- `normalizeRect(start,end)`。
- `rectsIntersect` 包含边缘接触。
- `idsIntersecting(items, worldRect, getRect)`。
- 屏幕矩形两端 `screenToWorld`，再与 `getItemRect(item)` 做 AABB。
- 3px 死区；pointer capture；Esc/取消由组件生命周期清理。
- `Shift` 并集；普通重置。
- 框选框 fixed 定位，浅色琥珀 / 深色冷蓝。

### 9.6 SelectionChrome

[src/components/canvas/SelectionChrome.vue](src/components/canvas/SelectionChrome.vue)

- 渲染在 CanvasStage 内，能 inject `canvasCameraKey`。
- 选中 1+ 显示浮动胶囊；2+ 显示外包围框。
- 位置基于 `camera.viewport` + `getContainerRect` + `getItemRect`。
- 拖拽中订阅 batch 的 live positions，让工具栏/包围框跟随。
- 复制 Markdown：`buildMarkdown(selectedEntries, board.connections)`。
- 工具栏 z35；不遮挡 HUD（限制 top / maxTop）。

### 9.7 Markdown

[src/lib/markdownExport.ts](src/lib/markdownExport.ts)

- `sortEntriesForReading`：Y 排序，80px 行容差，行内 X。
- `buildMarkdown`：仅 selected 两端连接；关系按目标阅读顺序排序。
- `copyTextToClipboard`：Clipboard API → 离屏 textarea → execCommand。
- 单测在 `tests/markdownExport.test.ts`。

### 9.8 Shortcut modal

[src/components/canvas/ShortcutModal.vue](src/components/canvas/ShortcutModal.vue)

- Teleport 到 body；`role=dialog` + `aria-modal` + `aria-labelledby`。
- 4 组：Capture / Navigate / Focus / Compose。
- `Esc` / 遮罩关闭；Tab 锁到关闭按钮。
- 打开时 App global keydown 提前 return。
- HUD 帮助按钮通过 CanvasStage 的 `shortcuts` emit 到 App。
- `?` 的 App 侧判定：
  - `!mod && !alt && event.key === '?'`；
  - 必须先过 `isEditableTarget`。
- E2E 里用 `page.keyboard.type('?')`；Playwright 的 `Shift+/` 可能只产生 `key: '/'`。

### 9.9 Empty state

[src/components/canvas/EmptyBoardState.vue](src/components/canvas/EmptyBoardState.vue)

- 渲染在 App 的 `#overlay` slot。
- 条件：`board.entries.length === 0`。
- 根节点 `pointer-events-none`；按钮 `pointer-events-auto` + `data-canvas-ui` + `@pointerdown.stop`。
- 点击 emit `capture` → App `openCapture()`。
- 首卡后 v-if 移除，通过 `<Transition name="empty-state">` 淡出。
- 不阻挡 HUD、空白画布手势。

---

## 10. 主题与视觉规范

- 浅色：`paper #f7f6f3`，`ink #292524`，暖灰/琥珀。
- 深色：zinc 系，微光边框，避免纯黑大块。
- 字体：
  - sans：SF Pro / PingFang / Noto Sans；
  - serif：Iowan / Songti / Noto Serif；
  - mono：SFMono / Menlo。
- 交互过渡统一 `cubic-bezier(0.22, 1, 0.36, 1)`（`ease-soft`）。
- 卡片有噪点、细线、呼吸选中环；不要引入高饱和品牌色。
- 新增 UI 要同时考虑 `dark` class 和 `prefers-reduced-motion`。
- 现有样式多在组件 `<style scoped>`；全局 token 在 `src/assets/main.css`。

---

## 11. 测试地图

### 11.1 Vitest

配置：[vitest.config.ts](vitest.config.ts)

- 环境：happy-dom。
- setup：`tests/setup.ts` → `fake-indexeddb/auto`。
- include：`tests/**/*.test.ts`。
- `restoreMocks: true`。
- 运行：`pnpm test`、`pnpm test tests/board-store.test.ts`。

17 个文件：

| 文件                              | 覆盖                                                  |
| --------------------------------- | ----------------------------------------------------- |
| `tests/backup.test.ts`            | 备份导出/导入/校验                                    |
| `tests/board-store.test.ts`       | seed、捕获、投影、删除、连线、历史、组提交/回滚、选择 |
| `tests/capture-placement.test.ts` | 贴身落点、中心级联                                    |
| `tests/coords.test.ts`            | screen/world 坐标、缩放锚点                           |
| `tests/drag-topology.test.ts`     | 内部/边界/无关连线裁剪                                |
| `tests/galaxy.test.ts`            | `/` 层级标签、暗化                                    |
| `tests/geometry.test.ts`          | 边中点、贝塞尔、Label 中点                            |
| `tests/global-search.test.ts`     | 全库投影索引、白板徽标、排序                          |
| `tests/group-drag.test.ts`        | 刚体 delta、batch 总线                                |
| `tests/markdownExport.test.ts`    | 阅读顺序、标签/原子笔记/关系/过滤                     |
| `tests/quick-capture.test.ts`     | 速记组件、保存失败回滚、焦点                          |
| `tests/selection.test.ts`         | 框选 AABB、反向拖拽、边缘相交、缩放无关               |
| `tests/spotlight-search.test.ts`  | 当前板检索、排序、标签                                |
| `tests/tags.test.ts`              | 标签归一化/解析/合并                                  |
| `tests/toast.test.ts`             | Toast 队列/定时/动作                                  |
| `tests/view-state.test.ts`        | viewport localStorage、坏数据回退                     |
| `tests/workspace-store.test.ts`   | 白板列表/切换/持久化                                  |

测试数据注意：

- `beforeEach` 里用 `db.delete()`；`afterEach` 再清。
- `setActivePinia(createPinia())`。
- 异步写断言用 `vi.waitFor`。
- 不要依赖真实 IndexedDB；用 fake-indexeddb。
- 组件测试可 mount 到 body；注意 Teleport / dialog。

### 11.2 Playwright

配置：[playwright.config.ts](playwright.config.ts)

- `testDir: e2e`。
- timeout 40s；expect 8s。
- fullyParallel: true。
- workers：本地 4，CI 2。
- retries：CI 2。
- baseURL `http://localhost:5199`。
- 默认 Playwright Chromium；`PLAYWRIGHT_CHROME=1` 时用系统 Chrome。
- webServer：`pnpm dev --port 5199 --strictPort`；本地复用已有 server。
- trace 失败保留；失败截图。

14 个文件 / 28 项：

| 文件                           | 项数 | 覆盖                                            |
| ------------------------------ | ---: | ----------------------------------------------- |
| `e2e/a11y.spec.ts`             |    1 | 速记焦点陷阱、卡片键盘移动                      |
| `e2e/boards.spec.ts`           |    1 | 新建/切换/重命名/删除白板                       |
| `e2e/capture-flow.spec.ts`     |    2 | 捕获上板/刷新存活、选中旁落点                   |
| `e2e/card-actions.spec.ts`     |    1 | 编辑/删除/撤销                                  |
| `e2e/connections-sync.spec.ts` |    1 | 连线跨标签同步                                  |
| `e2e/connections.spec.ts`      |    2 | 建线/Label/持久化/级联；30%/250% 端点吸附       |
| `e2e/data-menu.spec.ts`        |    1 | 备份导出/导入                                   |
| `e2e/global-spotlight.spec.ts` |    3 | 跨板穿梭、层级标签、触屏 HUD                    |
| `e2e/group-drag.spec.ts`       |    2 | 组刚体/连线/单步撤销；40%/200% 偏移             |
| `e2e/multi-tab.spec.ts`        |    1 | 多标签捕获/白板同步                             |
| `e2e/release.spec.ts`          |    5 | `?` 浮层、输入保护、HUD/遮罩、空板、元信息      |
| `e2e/selection.spec.ts`        |    3 | 框选/Shift/收窄、缩放与空格/中键、复制 Markdown |
| `e2e/spotlight.spec.ts`        |    4 | 飞行居中、快捷键边界、标签暗化、滚轮打断        |
| `e2e/viewport.spec.ts`         |    1 | 刷新恢复相机                                    |

常用命令：

```bash
pnpm exec playwright test e2e/release.spec.ts
pnpm exec playwright test e2e/group-drag.spec.ts --repeat-each=2
pnpm test:e2e:serial
pnpm test:e2e:chrome e2e/data-menu.spec.ts
```

### 11.3 E2E 稳定性经验

- **默认用 Chromium，不要用系统 Chrome 多 worker**。本机系统 Chrome 多 worker 会出现异常等待（1 分钟 → 5–6 分钟）。
- **新 context 自动 seed 3 张卡**；开页后先等 `[data-world-item]` count 3。
- **相机动画未停时量 bbox 会漂移**；需要 `waitForTimeout` 或等稳定。
- **高倍缩放下不是所有已选卡片都在视口内**；选择可见的最大选中卡片作为拖拽 source。
- **拖拽落点**：
  - 标题可能被顶栏覆盖；
  - 卡片左边缘中心可能是引线把手；
  - 正文是 `data-card-selectable`（不启动拖拽）。
  - group 测试使用可见卡片的边缘 30% 高度或标题下方 80%。
- **`?`**：用 `page.keyboard.type('?')`；不要假设 `Shift+/` 产生 `key: '?'`。
- **空板**：新建白板后 `[data-world-item]` 为 0，`[data-empty-state]` 可见。
- **剪贴板**：`context.grantPermissions(['clipboard-read','clipboard-write'])`。
- **失败截图/trace** 在 `test-results/`，已被忽略。
- 全量 28 项本地约 33 秒；目标文件约 1–10 秒。

---

## 12. 常见修改配方

### 12.1 新增一个用户可见 mutation

1. 在 `board.ts` 写 action。
2. 所有持久化对象先 `plainRecord`。
3. 本地状态先更新（乐观），再异步写。
4. 失败必须回滚本地；给 Toast 重试。
5. 成功后 `broadcastWorkspaceChange(...)`。
6. 只 record 一条历史；undo/redo 各自可重入。
7. 在 `tests/board-store.test.ts` 加成功 + 失败回滚测试。
8. 如果影响 UI，加 E2E。

### 12.2 新增屏幕浮层

1. 组件放 `src/components/...`。
2. 加 `role="dialog"`、`aria-modal`、`aria-label/labelledby`。
3. 遮罩 `@pointerdown.self` / `@pointerdown` 关闭。
4. 打开时处理焦点恢复；`Esc` 用 window listener，`stopImmediatePropagation` 防止 App 双处理。
5. App 打开状态要加入 `openShortcuts()` 等互斥 guard。
6. 加 `data-canvas-ui`（若在画布上），避免框选。
7. 加 `z-index`（参考第 8.3 节）。
8. 输入控件需被 `isEditableTarget` 排除。
9. 加 E2E：打开、Esc、遮罩、输入框不误触。

### 12.3 新增快捷键

1. 在 `App.vue` 的 `handleGlobalKeydown` 加分支。
2. 先过 `event.defaultPrevented || isComposing`。
3. 再过 `isShortcutOpen` / `isSpotlightOpen` / `isCaptureOpen`。
4. 再过 `isEditableTarget(event.target)`。
5. 再过 `board.isHydrated`。
6. `event.preventDefault()` 后执行。
7. 同步更新 `ShortcutModal.vue` 的键盘地图。
8. 加 E2E。

### 12.4 新增 E2E

```ts
import { expect, test } from '@playwright/test'

test('describes behavior', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  // arrange / act / assert
})
```

- 优先使用语义 locator / data 属性，不要用脆弱的 nth-child。
- 独立测试不要共享页面状态；每个 test 新 context。
- 需要多标签时用 `context.newPage()`。
- 需要剪贴板时显式 grantPermissions。
- 目标测试先跑，最后全量。

### 12.5 新增 Dexie 字段/表（慎重）

1. 先确认产品是否真的需要；v1.0 冻结 schema。
2. 在 `src/db/index.ts` 加 `this.version(3).stores(...)`。
3. 有数据迁移逻辑；不要只加字段不迁移。
4. 更新 `src/types/index.ts`。
5. 更新 `src/lib/backup.ts` 的 parser / payload。
6. 更新 README 的 schema 描述。
7. 加 migration / backup 测试。
8. 先在独立分支验证，不要直接改 `main`。

### 12.6 版本号升级

当前 `v1.0.0` 出现在：

- `package.json`
- `src/App.vue` 顶栏 subtitle
- `src/App.vue` footer
- `src/components/ui/DataMenu.vue` footer
- `src/components/canvas/ShortcutModal.vue` header
- `README.md`
- `public/manifest.webmanifest`（如需版本相关字段）

升级清单：

1. 全仓 `rg "v1\.0\.0|1\.0\.0"`。
2. 更新 UI 与 package。
3. 更新 README。
4. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`。
5. 提交后打 annotated tag，例如 `git tag -a v1.0.1 -m "Card Canvas v1.0.1"`。
6. `git push origin main && git push origin v1.0.1`。

---

## 13. 已知限制 / 技术债

这些不是当前 bug，但接手时要知情：

1. **版本号硬编码在多处**：升级必须全仓搜索；没有单一 `APP_VERSION`。
2. **无 Service Worker**：manifest 只是基础 PWA 元信息，不保证离线启动。
3. **历史栈只在内存**：刷新/切板丢失；最多 50 步。
4. **没有账号/云同步**：本地单浏览器存储；跨设备靠手动 JSON 备份。
5. **系统 Chrome 多 worker 异常**：不要用 `PLAYWRIGHT_CHROME=1` 跑并行全量。
6. **E2E 依赖若干固定等待**：相机动画/呼吸/过渡；新增测试尽量用 locator/attribute 条件，但不要随意删旧等待。
7. **Shortcut modal 只把 Tab 锁到关闭按钮**：没有完整 focusable cycle；背景未设置 inert；但 `aria-modal` 与遮罩存在。
8. **空状态只判断 `entries.length === 0`**：不处理“全部卡片被过滤/暗化”的场景。
9. **Markdown 只导出出向关系**：只导出 fromCard 在选中集合、toCard 也在选中集合的连接；没有反向关系。
10. **Card.highlights 主要是展示数据**：seed 有原子笔记；速记编辑目前不提供完整 highlights 编辑器。
11. **workspace.selectedCardId 是遗留字段**：没有作为新选择真相；可后续清理，但不要贸然删。
12. **无性能基准测试**：有 rAF/DOM transform 的工程约束，但没有 120fps 自动化指标。
13. **PWA 图标仅 SVG**：没有 Apple touch PNG；如需安装体验需补。
14. **CI 只跑 Chromium**；系统 Chrome 真浏览器只是本地抽查。
15. **E2E 测的是 dev server**：不是 production preview；build 单独验证。
16. **`dist` / `shots` / `test-results` 被忽略**：不要强行提交。

---

## 14. 建议的后续任务优先级

如果用户没有指定，建议按风险/收益排序：

1. **稳定性**：把 E2E 固定等待改为可观测的相机/过渡状态；进一步减少 30 秒以上的长测试。
2. **移动端体验**：HUD 六按钮在窄屏的间距；空状态/快捷键浮层的小屏滚动。
3. **可访问性**：ShortcutModal 的完整 focusable cycle、背景 inert、屏幕阅读器说明。
4. **版本单一来源**：引入 `APP_VERSION` 或 Vite define，消除多处硬编码。
5. **PWA 完整化**：只有在用户明确要求离线时，才加 Service Worker；必须设计缓存失效策略。
6. **数据迁移**：任何新字段都走 Dexie version + backup parser + migration tests。
7. **Markdown**：如需入向关系/双向关系，先定义语义并补单测；不要静默改变现有输出。
8. **性能**：先 profile；保持 batch bus、rAF、DOM transform 的既定架构，不要引入每帧 Pinia 写入。

---

## 15. 发布流程（v1.0.0 已完成）

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git status --short
git add -A
git commit -m "release: card canvas v1.0.0"
git tag -a v1.0.0 -m "Card Canvas v1.0.0"
git push origin main
git push origin v1.0.0
```

当前事实：

- commit `a863886`
- tag `v1.0.0`
- main 与 origin/main 同步
- 工作区干净
- 93 Vitest / 28 E2E
- 最新 E2E 本地约 33 秒

如果后续只加文档（例如本文件），会形成新的 commit，但 `v1.0.0` tag 仍指向发版提交；下一个版本应重新打 tag。

---

## 16. 关键文件索引

```text
src/
├── App.vue                          # 启动、全局快捷键、空状态、浮层编排
├── main.ts                          # Vue + Pinia
├── assets/main.css                  # 全局 token、主题、噪点/点阵
├── components/
│   ├── canvas/
│   │   ├── CanvasStage.vue          # 相机、世界层、overlay、HUD
│   │   ├── CanvasHUD.vue            # 缩放/居中/搜索/快捷键
│   │   ├── CardNode.vue             # 卡片、选中、拖拽、标签
│   │   ├── SelectionChrome.vue      # 包围框、工具栏、Markdown 复制
│   │   ├── EmptyBoardState.vue      # 空板引导
│   │   ├── ShortcutModal.vue        # ? 快捷键浮层
│   │   ├── ConnectionLayer.vue      # SVG 连线与 live path
│   │   └── SpotlightSearch.vue      # 全局搜索浮层
│   ├── board/BoardSwitcher.vue
│   ├── capture/QuickCapture.vue
│   └── ui/
│       ├── DataMenu.vue
│       └── ToastStack.vue
├── composables/
│   ├── useCanvas.ts                 # 相机/坐标/缩放/飞行
│   ├── useCardDrag.ts               # 单卡/刚体组拖拽
│   ├── useConnection.ts             # 引线状态机
│   ├── useMarqueeSelect.ts          # 空白框选
│   └── useTheme.ts                  # light/dark/auto
├── data/seed.ts                     # 3 张示例卡
├── db/index.ts                      # Dexie v2
├── lib/
│   ├── backup.ts                    # 全量导出/导入
│   ├── capture-placement.ts         # 贴身落点
│   ├── card-drag-bus.ts             # batch 拖拽总线
│   ├── card-metrics.ts              # 实测卡片高度/getItemRect
│   ├── drag-topology.ts             # 受影响连线裁剪
│   ├── galaxy.ts                    # 层级标签/暗化
│   ├── geometry.ts                  # 边中点/贝塞尔
│   ├── global-search.ts             # 全库索引
│   ├── group-drag.ts                # 刚体位置计算
│   ├── markdownExport.ts            # Markdown 蒸馏
│   ├── plain-record.ts              # Vue Proxy → plain
│   ├── selection.ts                 # AABB 框选
│   ├── spotlight-search.ts          # 当前板搜索
│   ├── tab-sync.ts                  # BroadcastChannel
│   ├── tags.ts                      # 标签归一化
│   └── view-state.ts                # 视口 localStorage
├── stores/
│   ├── board.ts                     # 核心 store
│   ├── toast.ts
│   └── workspace.ts
└── types/index.ts                   # 领域类型

tests/                               # 17 个 Vitest 文件
e2e/                                 # 14 个 Playwright 文件
public/
├── favicon.svg
└── manifest.webmanifest
index.html
playwright.config.ts
vitest.config.ts
README.md
HANDOFF.md
```

---

## 17. 常用 data 属性 / 测试选择器

| 选择器                                        | 含义                                |
| --------------------------------------------- | ----------------------------------- |
| `[data-world-item]`                           | 世界卡片 article                    |
| `[data-card-id]` / `[data-item-id]`           | Card / BoardItem ID                 |
| `[data-card-selectable]`                      | 正文/高亮文本，拖拽应让位给文本选择 |
| `[data-card-interactive]`                     | 标签、按钮、引线把手                |
| `[data-canvas-ui]`                            | 屏幕 UI，框选需排除                 |
| `[data-canvas-focus]`                         | 小屏初始聚焦目标                    |
| `[data-line]`                                 | 可见连线 path                       |
| `[data-hit]`                                  | 连线命中 path                       |
| `[data-connection-id]`                        | 连线组                              |
| `.connection-snap-ring`                       | 连线目标 Snap Ring                  |
| `.connection-draft`                           | 连线拖拽虚线                        |
| `.selection-toolbar` / `.selection-bounds`    | 多选工具栏/包围框                   |
| `[data-empty-state]`                          | 空板引导                            |
| `[data-shortcut-modal]`                       | 快捷键浮层                          |
| `[data-shortcut-group]`                       | 快捷键分类                          |
| `.brand-subtitle`                             | 顶栏版本/阶段                       |
| `[aria-label="当前缩放"]`                     | HUD 缩放百分比按钮                  |
| `[aria-label="居中全部卡片"]`                 | HUD fit                             |
| `[aria-label="撤销"]` / `[aria-label="重做"]` | 顶栏历史按钮                        |
| `[aria-label="切换白板"]`                     | 白板切换器                          |
| `[data-board-rename-input]`                   | 白板重命名输入                      |
| `[data-spotlight-result]`                     | 搜索结果项                          |

---

## 18. 环境 / 浏览器自动化注意事项

- 工作目录固定：`/Users/yunmu/Desktop/card-canvas`。
- Node ≥ 20.19.0；pnpm 10.33.0。
- 本机为 macOS Apple M1 Pro；有 10 核，但系统 Chrome 多 worker 依然异常，默认用 Chromium。
- 本地 dev server 端口 5199；如果已在运行，Playwright 复用。
- Arc 可能已打开 `http://localhost:5199/`；不要为了看效果启动第二个端口。
- 视觉检查可用 Playwright MCP 或 Arc；截图放 `shots/`（已忽略）。
- 若 HMR 后出现旧组件错误：先刷新页面，不要立刻以为代码坏了。
- 若 E2E 失败：先看 `test-results/.../error-context.md` 与截图，再跑单 worker 目标文件。
- 不要用像素点击猜控件；优先 `getByRole` / `getByLabel` / data 属性。
- 如果必须操作 Arc 登录态，遵循本机全局规则（CDP 9222 / AppleScript），但本项目的 E2E 不需要登录态。

---

## 19. 交接结论

- v1.0.0 是可发布状态：画布、捕获、连线、搜索、星系、框选、刚体拖拽、Markdown、快捷键、空板引导、版本/PWA 元信息均已收口。
- 当前最大风险不是功能缺失，而是**破坏既有契约**：尤其是选择真相、拖拽热路径、原子历史、Dexie schema。
- 任何新任务先判断属于哪一层：
  - UI 收口 → 改组件 + E2E；
  - 数据契约 → store + plainRecord + history + backup + unit；
  - 画布力学 → 纯函数 + 单测 + 高倍缩放 E2E；
  - 版本/PWA → 全仓版本搜索 + manifest/index + build；
  - 测试基础设施 → 保持 Chromium 4 workers，系统 Chrome 只做单 worker 抽查。
- 完成修改后必须重新跑：`format:check`、`lint`、`typecheck`、`test`、`build`、`test:e2e`，并在最终回复中报告实际数量与耗时。

**接手后的第一条命令：**

```bash
cd /Users/yunmu/Desktop/card-canvas && git status --short --branch && pnpm test
```
