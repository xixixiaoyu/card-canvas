# Card Canvas

卡片笔记与无限白板工具 · **Phase 02 / Infinite Canvas**

Phase 01 已完成工程基建、领域契约、Dexie、Pinia 与双主题；Phase 02 建立画布的运动底座：世界坐标系、GPU 平移缩放、锚点缩放、手势状态机与 HUD。

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

## 画布操作

- **触控板双指滑动**：平移
- **触控板捏合** / `Ctrl` + 滚轮：以光标为不动点缩放
- **空格 + 左键拖拽**：平移
- **鼠标中键拖拽**：平移
- **HUD**：缩小、放大、点击百分比恢复 100%、居中全部卡片
- 缩放范围：`10% – 300%`；到达边界时按钮禁用、百分比转为琥珀色反馈
- 快捷键检测会避开 `<input>`、`<textarea>`、`select`、`contenteditable` 与 HUD 控件

## 目录

```text
src/
├── assets/main.css              # Tailwind、双主题、动态 LOD 点阵
├── components/
│   ├── canvas/
│   │   ├── CanvasStage.vue      # 视口容器、世界层、事件与初始取景
│   │   ├── CanvasHUD.vue        # 缩放 / 居中悬浮胶囊
│   │   └── CardNode.vue         # 世界坐标中的卡片节点
│   ├── capture/                 # 1D 速记占位
│   └── inbox/                   # 待整理池占位
├── composables/
│   ├── useCanvas.ts             # 运动引擎、坐标换算、手势状态机
│   └── useTheme.ts              # useDark + useToggle 主题管理
├── db/index.ts                  # Dexie 单例与三张表
├── stores/workspace.ts          # Pinia 白板 / 选择状态
├── types/index.ts               # Card Entity 与 BoardItem 投影契约
├── App.vue                      # 三张世界坐标卡片与画布 UI
└── main.ts                      # 应用入口（挂载 Pinia）
```

## 坐标与动效契约

- **实体与投影解耦**：`Card` 是内容实体，`BoardItem` 只记录它在某块白板上的世界坐标。
- **坐标换算**：`useCanvas.ts` 导出类型化的纯函数 `screenToWorld` / `worldToScreen`；`useCanvas()` 另行返回绑定当前相机的二参数版本，便于组件直接使用。
- **绝对不动点缩放**：每一帧都通过 `pan = cursor - world × scale` 重算 pan，而非只在 wheel 事件里计算一次；快速缩放过程中光标下的文字保持静止。
- **GPU 与高频更新**：世界层直接写入 `translate3d(...) scale(...)`，`transform-origin: 0 0`；平移/缩放状态保存在普通对象中，由单一 `requestAnimationFrame` 循环写 DOM，高频回调不触发深层响应式更新。
- **动态 LOD 点阵**：低缩放时增大世界网格间距避免莫尔条纹，极高缩放时渐隐点阵透明度；网格位置由 `pan` 取模对齐世界原点。
- **主题持久化**：首次访问跟随系统（`auto`）；首次点击切换后始终写入明确的 `light` / `dark`，首屏由内联脚本恢复，避免闪烁。
- **响应式边界**：页面本身永不滚动；桌面初始居中全部卡片，小屏初始聚焦主卡片，HUD 可随时居中全部。
- **可访问性**：HUD 与主题按钮有完整 `aria-label`，画布提供屏幕阅读器操作说明；系统开启「减少动态效果」时关闭平滑过渡与飞行动画。
