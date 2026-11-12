# Card Canvas

> 为跨学科探索者打造的轻量原子卡片与 2D 无限白板。
>
> **v1.8.0 · Local-First · 可选 AI 与 Supabase**

Card Canvas 不要求你先建立完美分类，也不把思考塞进聊天记录。它把每一个念头压缩成一张可触摸的原子卡片，让卡片在二维空间里自然生长、彼此牵引，并在需要时收敛成一篇可带走的大纲。

## 愿景

跨学科探索者的困境通常不是“没有想法”，而是想法在笔记、聊天、书签和脑中同时存在，却从未真正相遇。Card Canvas 只做三件事：

1. **降低捕获摩擦**：一个快捷键，把念头直接放上画布。
2. **保留空间记忆**：让位置、邻近和连线成为第二层语义。
3. **支持认知收束**：从发散的白板中提取结构化 Markdown。

## 设计哲学

- **拒绝长篇大论**：卡片先于文档；一张卡只承载一个可复用的原子观点。
- **捕获即上板**：没有“待整理池”，保存动作就是空间动作。
- **贴身生长**：新卡优先落在当前卡片旁边，而不是被丢到画布深处。
- **实体与投影解耦**：`Card` 是内容真相，`BoardItem` 只是它在某块白板上的空间投影；同一张卡可以出现在多块白板。
- **本地优先**：Dexie / IndexedDB 始终是主存储和交互事实源；登录后由可在断网时继续工作的后台 outbox 将数据异步同步到 Supabase。
- **克制而非空白**：低饱和特种纸、微弱噪点、细线连线和一套有节制的琥珀色强调。
- **可解释的力学**：缩放、框选、刚体拖拽与撤销都基于可测试的几何，而不是肉眼调参。

## 全景能力

| 能力        | 体验                                                         |
| ----------- | ------------------------------------------------------------ |
| 即时捕获    | `⌘K` 速记，卡片直接落在当前白板                              |
| 2D 漫游     | 空格/中键平移，滚轮或捏合缩放，10%–300%                      |
| 认知连线    | 从卡片边缘拖出曲线，自动贴边并支持语义标签                   |
| 卡片纵览    | `⌘F` 打开 Card Atlas，浏览全库并跨白板飞行到目标卡片         |
| 层级星系    | 点击标签，按 `/` 层级聚合命中，其余卡片暗化                  |
| 多选与刚体  | 空白框选、Shift 并集、整组平移、单步原子撤销                 |
| 认知蒸馏    | 将选中卡片导出为阅读顺序的 Markdown 大纲                     |
| 云端同步    | GitHub、邮箱验证码或 Magic Link 登录，断网继续编辑并异步同步 |
| AI 认知辅助 | 关联雷达、自动标题与层级标签，均在后台非阻塞完成             |
| 跨板复用    | 同一张卡片加入多块白板，内容共享、位置与连线各自独立         |
| 语义搜索    | 本地结果即时返回，主动触发 AI 后按自然语言召回并解释关联     |
| 分享卡片    | 6 套主题、3 种比例，导出 PNG 或复制图片，不暴露白板位置      |
| 今日待办    | 一次点击生成当天任务卡，回车续写，同日再次进入已有卡片       |
| 一键整理    | 按当前阅读顺序排成自适应瀑布网格，单步撤销且不改卡片内容     |
| 数据恢复    | 30 天回收站、当前板移出、历史版本快照与永久删除              |
| 离线启动    | PWA 应用壳预缓存，首次在线加载后可断网重新打开               |
| 快捷键备忘  | 按 `?` 随时查看完整键盘地图                                  |
| 空板引导    | 空白白板中央提供一次点击即开始的捕获入口                     |

## 技术栈

- Vue 3 + TypeScript + Vite
- Tailwind CSS 3.4 + PostCSS / Autoprefixer（classic config + `darkMode: 'class'`）
- Pinia 状态管理
- Dexie 4 本地 IndexedDB
- Supabase Auth + Postgres + Realtime（可选云端同步）
- DeepSeek Chat Completions（可选 BYOK AI，自有 Vite / Vercel 同源代理）
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
pnpm test:e2e           # Playwright：默认 Chromium + 4 workers，全量约 30s
pnpm test:e2e:serial    # 单 worker，调试偶发失败
pnpm test:e2e:chrome    # 系统 Chrome 真浏览器抽查（单 worker）
pnpm exec playwright install chromium  # 可选：安装 E2E 浏览器
pnpm build              # typecheck + vite build
pnpm preview
```

## 云端同步与部署

未配置环境变量时，应用保持纯本地模式，登录入口不会出现，所有现有功能无需 Supabase 即可运行。

### 1. 创建 Supabase 项目

1. 在 Supabase 创建项目，区域优先选择 Singapore 或 Tokyo。
2. 在 SQL Editor 中执行 [supabase/schema.sql](supabase/schema.sql)。
3. 在 Authentication 的 URL Configuration 中把 Site URL 设为生产域名，并把本地 `http://localhost:5199` 与生产域名加入 Redirect URLs。
4. 从 Project Settings 的 API 页面取得 Project URL 与 publishable key（旧项目也可能显示 anon public key）。
5. 如需 GitHub 登录，在 GitHub 创建 OAuth App，Callback URL 使用 `https://<project-ref>.supabase.co/auth/v1/callback`，再把 Client ID / Secret 填入 Supabase Authentication → Sign In / Providers → GitHub。
6. 邮箱验证码默认开启。配置自定义 SMTP，并在 Magic Link 邮件模板中同时加入 `{{ .Token }}` 与 `{{ .ConfirmationURL }}`；如需临时隐藏验证码入口，可设置 `VITE_EMAIL_CODE_ENABLED=false`。

### 2. 配置本地环境

```bash
cp .env.example .env.local
```

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
VITE_EMAIL_CODE_ENABLED=true
```

publishable key 或旧版 anon key 可以暴露给浏览器；真正的数据隔离由 `user_id` + RLS 完成。不要把 secret / `service_role` key 放入任何 `VITE_` 环境变量。

### 3. 部署到 Vercel

仓库已包含 [vercel.json](vercel.json)，会执行 `pnpm build`、发布 `dist` 并处理 SPA 重写。

```bash
vercel
vercel --prod
```

生产项目已连接 GitHub `xixixiaoyu/card-canvas`；推送到 `main` 会自动触发 Production Deployment。

在 Vercel Project Settings → Environment Variables 中配置同名变量：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_EMAIL_CODE_ENABLED
```

部署后把生产域名补进 Supabase Authentication → URL Configuration 的 Site URL 与 Redirect URLs。

## AI 认知辅助

AI 能力默认关闭，不配置 Key 时不会发送任何 AI 请求。点击顶栏独立的「AI」入口，填写 DeepSeek API Key 后可使用：

- **关联雷达**：选中单卡后点击卡片上的星光图标，本地先按层级标签、二阶邻居和标题词重合筛选最多 6 张候选，再由 AI 返回最多 3 条带理由与强度的关系。候选只存在内存中，确认后才建立带标签连线并进入撤销栈。
- **自动标题**：只写正文也能立即上板。标题先保持中性的「未命名卡片」，随后由 AI 根据正文提炼短标题；只有标题仍为占位且正文未变时才回填，不会覆盖用户后来手写的标题。
- **层级标签**：速记中可主动请求建议；无标签卡片保存后也会由后台异步补齐 `学科/分支`，不阻塞 0ms 上板。
- **语义搜索**：Card Atlas 中只有点击「AI 语义」或按 `⌘Enter` 才调用模型。AI 先扩展查询概念，本地召回候选，再进行语义精排；查询变化会取消请求，未配置 Key 时本地搜索不受影响。

DeepSeek 是默认且唯一的主通道。用户可在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 自行注册、充值并创建 API Key，调用费用由用户账户按量直接结算。默认模型为 `deepseek-flash`，短连接测试、层级标签和关联雷达显式关闭思考模式，避免推理 token 挤占最终回答；第三方兼容端点和 `deepseek-v4-pro` 保留在折叠的高级设置中。

API Key 只保存在当前浏览器的 `localStorage`，不会进入 Dexie、Git 或项目环境变量。启用 AI 功能后，相关卡片的标题与正文会发送到 DeepSeek。Vite 开发服务器通过 `/api/deepseek` 代理请求；Vercel 生产环境由 `api/deepseek.ts` Edge Function 转发。该方案避免浏览器跨域，但浏览器本地密钥仍可能被同源脚本读取，不属于服务器托管密钥的安全级别。

### 分享卡片工作室

卡片操作区的分享图标会打开独立工作室，而不改变白板卡片本身。可选择晨纸张、午夜墨、海盐蓝、档案馆、晚霞纸或苔原主题，切换 1:1、3:4、16:9，并控制标签、日期与品牌签名。PNG 在离屏固定尺寸画布中生成，支持下载或复制到图片剪贴板；导出只包含卡片内容与所选装饰，不包含账号、白板位置或其他卡片，也不写入 Dexie。

### 今日待办

顶栏「今日」按钮会打开预填当天日期、`待办/今日` 标签与任务清单的速记卡。输入一条待办后按 Enter 会自动续写下一条；保存后直接进入当前白板的行动透镜。同一天再次点击不会重复建卡，而是选中并飞回当天卡片。保存时最后一条空白任务会自动移除。

### 同步语义

- 本地写入先提交 Dexie，再进入持久化 outbox；网络请求不阻塞拖拽、速记或历史操作。
- outbox 在断网、刷新和关闭页面后仍保留，恢复在线时自动补传。
- 下行按表维护独立的 `server_updated_at` 游标并分页拉取，完全不依赖设备时钟，也不会因跨表时间竞争漏数据。
- 同一条记录按 `updatedAt` 做最后写入胜出；本地仍有未上传的新版本时会保留本地版本。
- 软删除墓碑会同步到其他设备，列表和画布只显示未删除数据。
- 一台设备第一次登录时，会把现有本地工作区认领给该账号。为避免账号间数据混用，本机已绑定其他用户时会暂停同步。
- Supabase 四张表均启用 RLS 与 `REPLICA IDENTITY FULL`；复合主键包含 `user_id`，实时订阅和所有读写查询都同时按当前用户过滤。

本地与 CI 的 E2E 默认使用 Playwright 自带 Chromium，并开启 fullyParallel：本地 4 workers，CI 2 workers。实测系统 Chrome 在多 worker 下会异常放大等待时间（全量从约 1 分钟退化到 5–6 分钟），因此仅保留 `test:e2e:chrome` 作为单 worker 真浏览器抽查。`.github/workflows/ci.yml` 会依次跑格式检查、lint、typecheck、单测、构建与 E2E。

开发环境首次打开空数据库时会写入三张示例卡片，便于调试画布；生产构建默认保持空板，并会清理旧版本遗留在本地的固定 demo 记录。用户自行创建的卡片不会被清理。

## 画布操作

- **触控板双指滑动**：平移
- **触控板捏合** / `Ctrl` + 滚轮：以光标为不动点缩放
- **空格 + 左键拖拽**：平移
- **鼠标中键拖拽**：平移
- **HUD**：缩小、放大、点击百分比恢复 100%、居中全部卡片
- 缩放范围：`10% – 300%`；到达边界时按钮禁用、百分比转为琥珀色反馈

## 卡片交互

- **点击卡片**：单选并显示主题化光环
- **双击编辑**：双击标题、卡片留白或底栏打开编辑；双击正文仍保留选词
- **点击空白画布**：取消选中
- **拖动卡片**：从卡片标题、右上角 grip、卡片留白或底栏拖动
- **内容区**：正文与原子笔记文本可被选中；标签与正文不会误触发卡片拖拽
- **拖拽死区**：屏幕位移小于 `3px` 视为点击；超过后才进入拖拽态；多选时单击卡片会精准收窄为单选
- **多卡刚体**：从任意已选卡片拖拽，整个选中集群共享同一世界位移，相对间距在任何缩放级别保持不变
- **空格优先**：按住空格时，即使从卡片上起手也进入画布平移，不改动卡片与选中态
- **缩放补偿**：`worldDelta = screenDelta / viewport.scale`，在 30% 与 200% 下光标均与拾起点严格咬合
- **高程反馈**：拾起时 `scale(1.018)`、漫反射阴影增强、`z-index` 置于最上层；放下后平滑回落
- **持久化时机**：拖拽期间只写 DOM transform；`pointerup` 时多卡通过一个 `bulkPut` 事务提交 Pinia，并只记录一条历史
- **原子 Markdown**：支持加粗、斜体、行内代码、高亮、无序列表与任务框；标题、HTML 和表格不会被解析成富文本
- **`/` 格式命令**：在速记正文的空白行输入 `/`，可快速插入无序列表、有序列表或任务清单
- **行动透镜**：顶栏汇总当前白板未完成任务，可直达对应卡片，也可在抽屉内直接勾选

## 即时速记（Capture to Board）

### 保存即上板

- **唤出**：`⌘K` / `⇧N`，或顶栏「速记」按钮
- **字段**：标题、正文、标签（回车 / 逗号添加，`#标签` 在保存时自动解析）
- **保存**：`⌘↵` / `Ctrl ↵`；一次原子操作同时创建 `Card` 与 `BoardItem`，卡片立即选中，弹窗同步关闭，Dexie 事务在后台写入
- **防误触**：有未保存内容时点击遮罩不会关闭速记；只有 `Esc` 或关闭按钮才明确退出，避免记录被误丢
- **无标题**：不再截取正文前 48 字充当标题；AI 未启用或生成失败时保留中性占位「未命名卡片」
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

## Card Atlas 卡片纵览

- **唤出**：`⌘F` / `Ctrl F` 或 `/`；HUD 右侧也有纵览图标，触屏设备可直接点按
- **纵览范围**：默认展示全工作区卡片，可切换当前白板；支持最近修改与标题排序
- **卡片信息**：集中展示摘要、标签、所属白板与待办数量
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
- **单卡操作**：选中单张卡片后，复制 Markdown 图标与编辑、删除并列出现在卡片操作区
- **浮动工具栏**：选中 2 张以上时，在集群上方（空间不足时下方）出现极简胶囊，并显示虚线外包围框
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

- **复制入口**：单卡使用卡片操作区的复制图标；集群使用浮动胶囊里的「复制 Markdown」
- **阅读顺序**：先按世界 Y 从上到下，Y 差 `80px` 内视为同一行，再按 X 从左到右
- **卡片结构**：`### 标题`、`#标签`、正文、原子笔记列表
- **连线语义**：仅导出**两端都在选中集合内**的 Connection；关系挂在来源卡片下，如
  `> ↳ 关联 [边界不是墙]：底层神经机制相同`
- **剪贴板**：优先 `navigator.clipboard.writeText`；失败时降级到屏幕外 textarea + `execCommand('copy')`，textarea 固定在 `-9999px` 且 `pointer-events:none`
- **反馈**：成功 Toast「已复制 N 张卡片大纲到剪贴板」；单卡复制图标切换为对勾，集群工具栏短暂显示「已复制」

> v1.1.0 在 v1.0.0 的画布能力之上增加可选云端账号、离线 outbox 与多设备同步。

## 快捷键备忘与空板引导

- **`?`**：打开快捷键备忘录；`Esc` 或点击遮罩关闭
- **HUD `?`**：底部视图胶囊右侧的帮助图标，触屏设备也可直接点按
- **输入保护**：所有 `input`、`textarea`、`select`、`contenteditable` 中的问号只作为文字输入，不会误触浮层
- **四组内容**：捕获、漫游、检索聚焦、组织产出；浅色特种纸与深色微光各自有一版材质
- **版本锚点**：浮层页脚展示 `v1.8.0`，与顶栏、页脚和数据菜单保持一致
- **空板零状态**：当前白板没有卡片时，视口中央出现「空白也是一块画布」；点击或按 `⌘K` 唤起速记，首张卡片出现后柔和淡出

## 键盘与无障碍

- **速记**：`⌘K` / `⇧N` 打开；`Tab` 焦点锁定在弹窗内，背景 `inert`；`Esc` 关闭
- **搜索**：`⌘F` / `/` 或 HUD 搜索按钮打开；`↑` / `↓` 选择，`Enter` 跨板飞往，`Esc` 关闭；输入、编辑或选中文本时不会误触
- **画布卡片**：可聚焦；方向键移动 `10px`，`Shift + 方向键` 移动 `1px`；`Enter` / `Space` 选中
- **多选**：空白处拖拽框选；`Shift` 框选增量；已有多选时单击卡片收窄为单选，拖拽则整组平移
- **连线**：`Tab` 聚焦后选中；`Enter` 编辑说明，`Delete` / `Backspace` 删除
- **撤销 / 重做**：`⌘Z` / `⇧⌘Z`（Windows 支持 `Ctrl+Y`），顶栏也有按钮
- **屏幕阅读器**：选中变化通过 `aria-live` 播报；字符漂移、焦点环、`aria-current` 均已补齐

## 多白板

- 顶栏白板切换器：新建、重命名、切换、两步确认删除
- 卡片操作区可把同一张卡加入其他白板；标题、正文和标签共享，位置及连线分板保存
- `boards` 表为 Dexie v2；删除白板级联删除其 `boardItems` 与 `connections`，卡片实体保留
- 每块白板独立保存视口（`localStorage`），刷新/切板后恢复缩放与平移
- Spotlight 检索全库卡片并按投影显示；星系聚焦是局部 UI 状态，切板自动清空
- 卡片实体全局存储，投影属于白板；速记始终落在当前白板
- 删除白板后，保留的卡片若已无任何投影，会在下次加载时迁移到当前白板

### 一键整理当前白板

HUD 的网格按钮提供三种方式：全部卡片按阅读顺序整理、只整理选中卡片、按现有连线把关联卡片聚成簇。算法保留每张卡的原始宽度，并根据实际内容高度寻找最短列，避免重叠；完成后镜头自动适配全部卡片。整理只更新 `BoardItem.x/y`，不会修改卡片内容、标签、连线或白板归属，并作为单独一步进入撤销/重做历史。

### 回收站与历史版本

删除卡片会进入保留 30 天的回收站；共享卡片可以从当前白板单独移出，也可以从所有白板删除。恢复时自动回到当前白板并保留已有投影或补建位置。每次正文、标题或标签发生实质修改前，会保存最近 8 个本地历史版本，可在编辑卡片时恢复，并继续通过撤销栈回退。

## 撤销与数据安全

- 速记上板、移动、编辑、删除、建线/删线/Label 均可撤销/重做（内存历史，最多 50 步）
- 删除为可恢复软删除；回收站保留 30 天，永久删除会同步清理投影、连线与历史版本
- 顶栏数据菜单可导出/导入完整 JSON 备份（cards / boardItems / connections / boards / cardVersions）；导入按 id 合并
- 启动时申请 `navigator.storage.persist()`；写入失败会回滚并给出可重试 toast

## 版本与 PWA 元信息

- 版本：`v1.8.0`（`package.json`、顶栏、页脚、数据菜单、快捷键浮层统一）
- `index.html`：`application-name`、`apple-mobile-web-app-*`、`color-scheme`、`format-detection` 与动态 `theme-color`
- `public/manifest.webmanifest`：standalone 显示、主题色、启动路径与 192/512/maskable PNG 图标
- `vite-plugin-pwa`：生产构建生成 Service Worker，预缓存应用壳与静态资源；`/api/*` 不进入离线回退
- 首次启动请求 `navigator.storage.persist()`，尽力降低浏览器回收 IndexedDB 的概率

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
│   │   ├── EmptyBoardState.vue  # 空白白板的一次点击捕获引导
│   │   ├── ShortcutModal.vue    # ? 快捷键备忘录 / 四组键盘地图
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
- **云端出站队列**：Dexie `v3` 新增 `syncOutbox` 与 `syncMeta`，只追加同步元数据，不改已有四张领域表的索引；本地写事务提交后再合并入队，失败不影响本地编辑。
- **云端入站隔离**：远端拉取写入通过 suppression guard，禁止触发 outbox，避免同步回声；随后通过现有 refresh 管线刷新 Pinia。
- **云端权限边界**：四张远端表启用 RLS，策略只允许 `auth.uid() = user_id`；公开前端只使用 publishable key 或旧版 anon key。
- **云端同步完整性**：每张表独立分页推进服务端时间游标，实时发布启用完整旧行标识，账号不匹配时本地同步直接锁定。
- **原子 Markdown 边界**：正文由白名单 AST 直接渲染为 Vue 文本与内联元素，全程不使用 `v-html`；任务勾选只替换对应行，不改变 Dexie schema。
- **主题持久化**：首次访问跟随系统；手动切换后明确写入 `light` / `dark`；首屏内联脚本恢复，避免闪烁。
- **可访问性**：焦点陷阱、`inert` 背景、键盘移动、连线 `Tab` 聚焦、搜索 `role=listbox` + `aria-selected`、`aria-live` 选中播报与可见焦点环。

## 质量防线

- **Vitest**：覆盖几何、触控板滚轮分类、框选 AABB、刚体位移、连线拓扑、原子 Markdown、有序列表、任务行替换、原子撤销、白板清空、Markdown 排序、Card Atlas 数据层、关联雷达排序与严格 JSON、分享主题与文件名、AI 客户端、捕获、认证会话与回调错误、账号锁定、云端增量游标、冲突、离线 outbox、白板级联删除与旧 demo 清理。
- **Playwright**：覆盖捕获、拖拽落点、缩放后平移、双击编辑、`/` 格式命令、今日待办续写、一键整理与撤销、移动端布局、多种登录入口、白板与清空、跨标签历史失效、连线、Card Atlas、层级星系、多选、刚体拖拽、任务勾选、行动透镜、单卡关联雷达、分享工作室 PNG 分辨率、Markdown 导出、快捷键浮层与空板引导。
- **本地 E2E**：Playwright Chromium + 4 workers，fully parallel，全量约 30 秒；`pnpm test:e2e:serial` 用于单 worker 定位偶发失败。
- **真浏览器抽查**：`pnpm test:e2e:chrome` 使用系统 Chrome，单 worker，避免多实例等待放大。
- 每次提交前运行 `format:check` / `lint` / `typecheck` / `test` / `build` / `test:e2e`。

## v1.2.0 原子 Markdown 版本

v1.1.0 以可选云端层扩展存储边界；v1.2.0 在不修改 Dexie schema 的前提下增加白名单 Markdown、卡片内任务切换和行动透镜。画布、刚体拖拽、撤销与云端同步契约保持不变。

## v1.3.0 快速格式版本

v1.3.0 增加行首 `/` 格式菜单、有序列表渲染，并校准列表标记与首行文字的垂直对齐。

v1.3.1 增加双击卡片进入编辑，并将选中态收敛为单独外环，减少卡片边界与光晕叠加带来的视觉噪声。

v1.3.2 移除卡片装饰性序号、笔记计数和重复状态文案，将拖拽提示收敛为低对比图标。

v1.3.3 优化移动端顶栏折叠与 HUD 触控尺寸，并延后中等宽度下撤销/重做按钮的显示。

v1.4.0 加入 GitHub OAuth、邮箱验证码与 Magic Link 三种登录方式，并补齐 OAuth 回调错误提示。邮箱验证码入口由 `VITE_EMAIL_CODE_ENABLED` 控制，需先配置自定义 SMTP。

v1.4.1 将任务清单设为 `/` 格式菜单的默认第一项，并阻止开发环境示例卡被同步到云端，同时清理历史账号中残留的固定示例数据。

v1.4.2 默认开启已配置 SMTP 的邮箱验证码登录，同时保留 `VITE_EMAIL_CODE_ENABLED=false` 紧急回退开关。

v1.4.3 收敛 Playwright 的启动、撤销、拖拽与移动端尺寸竞态，并通过 CI 等价的 2 worker 双轮全量回归。

v1.4.4 修复卡片拖拽提交竞态、缩放后 Space 平移误触缩放、白板删除数据串板与卡片删除同步复活，并补齐删除事务和错误处理。

v1.4.5 修正缩放交互回归测试的首屏相机就绪判定，确保 CI 冷启动下仍能稳定验证 Space 平移。

v1.4.6 将撤销与重做从独立圆形图标收敛为带文字标签的历史控制组，并新增保留白板与共享卡片的可撤销“清空当前白板”操作。

v1.4.7 将云端增量拉取改为每张表独立分页的服务端时间游标，为实时表启用完整旧行标识，在远端变化时清理失效撤销历史并锁定不匹配账号的本地编辑，完成匿名、本账号和伪造跨账号写入的 RLS 实测。

v1.4.8 将增量游标升级为服务端时间与记录 ID 的复合游标，避免同一时间戳下的分页记录被跳过；补齐同步进行中二次触发的重跑机制、账号切换中的异步中止保护，并防止新设备首次登录时默认白板覆盖远端白板名称。

v1.5.0 加入 BYOK DeepSeek 凭证中心、生产同源代理、双卡虫洞探针和非阻塞层级标签推断。连线建议只在用户确认后落盘，自动标签在卡片上板后异步补齐，所有模型输出都经过长度与格式清洗。

v1.5.1 将 DeepSeek 收口为默认主通道，默认模型迁移到 `deepseek-flash`，设置页只保留 API Key、申请充值入口和功能开关；模型与自定义端点折叠进高级设置，并增加余额不足提示。

v1.5.2 修复 DeepSeek 思考模式可能耗尽短请求 token、导致最终内容为空的问题；开始拖拽卡片时会退出标签聚焦，并让被拖拽卡片临时置顶且完全可见。API Key 同时去除密码字段语义并增加密码管理器忽略标记，避免 Arc 误弹保存密码。

v1.5.3 为行动透镜加入鼠标悬停轻预览：延迟 400ms 展示最多 3 条待办，点击后仍打开完整交互抽屉；无待办时不弹预览，触屏与键盘继续使用点击入口。

v1.5.4 将全局搜索升级为 Card Atlas 卡片纵览：`⌘F` 默认展示全工作区卡片网格，支持当前白板/全部白板切换、最近/标题排序、摘要、标签、白板徽标与待办数量，并保留键盘穿梭。

v1.6.0 将双卡虫洞探针升级为单卡关联雷达：本地先按标签层级、二阶邻居与标题词重合筛选最多 6 张候选，再由 AI 返回最多 3 条可解释、可拒绝的关系，只有用户确认才写入连线。同时加入分享卡片工作室，提供 6 套主题、1:1 / 3:4 / 16:9 比例、标签与日期开关，以及离屏 PNG 下载和图片剪贴板复制；分享内容不包含账号或白板位置。顶栏新增「今日」入口，可预填当天任务卡、按 Enter 连续续写，同日重复点击会回到已有卡片。

v1.6.1 修复速记误触：有内容时点击遮罩不再关闭，草稿按白板分别保留；桌面编辑面扩大并居中，正文默认展示 8 行，并默认聚焦正文。只填正文时不再截取正文冒充标题，而是先以「未命名卡片」立即上板，再由 AI 在后台生成可撤销的短标题，AI 不可用时保持中性占位。

v1.7.0 将卡片标签移到右下角页脚，避免与顶部操作区争抢空间，并同步放大顶部操作图标。HUD 新增一键整理当前白板：按现有阅读顺序与实际卡片高度生成 2 至 4 列瀑布网格，完成单步可撤销的位置调整并自动适配镜头，不修改卡片内容、标签、连线或白板归属。

v1.8.0 打通跨白板卡片复用与删除语义：同一张卡可以出现在多块白板，支持单独移出当前白板或整卡删除。新增 30 天回收站、永久删除和最近 8 个本地版本恢复；整理模式扩展为阅读顺序、仅选中卡片、关联聚类三种；Card Atlas 新增主动触发的 AI 语义搜索；生产构建加入 PWA 应用壳预缓存，支持首次在线加载后断网重新打开。
