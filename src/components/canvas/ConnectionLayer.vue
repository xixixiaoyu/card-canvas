<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  connectionKey,
  type ConnectionController,
} from '../../composables/useConnection'
import { getItemRect } from '../../lib/card-metrics'
import { isConnectionDimmed } from '../../lib/galaxy'
import {
  subscribeCardDragBatch,
  subscribeCardDragEndBatch,
} from '../../lib/card-drag-bus'
import { connectionsTouchingCards } from '../../lib/drag-topology'
import {
  connectionGeometry,
  draftGeometry,
  type ConnectionGeometry,
  type Rect,
} from '../../lib/geometry'
import { useBoardStore } from '../../stores/board'
import type { BoardItem, Connection } from '../../types'

const board = useBoardStore()
const injectedConnection = inject(connectionKey)

if (!injectedConnection) {
  throw new Error('ConnectionLayer must be rendered inside CanvasStage')
}

const connection: ConnectionController = injectedConnection

const svgRoot = ref<SVGSVGElement | null>(null)
const hoveredId = ref<string | null>(null)
const labelDraft = ref('')
const labelInput = ref<HTMLInputElement | null>(null)

function setLabelInput(element: unknown) {
  labelInput.value = element instanceof HTMLInputElement ? element : null
}
const livePositions = new Map<string, { x: number; y: number }>()

interface RenderedConnection {
  connection: Connection
  geometry: ConnectionGeometry
  dimmed: boolean
}

function itemForCard(cardId: string): BoardItem | undefined {
  return board.items.find((item) => item.cardId === cardId)
}

function liveRect(item: BoardItem): Rect {
  const rect = getItemRect(item)
  const override = livePositions.get(item.id)

  return override ? { ...rect, x: override.x, y: override.y } : rect
}

function geometryForPair(
  fromItem: BoardItem,
  toItem: BoardItem,
  live = false,
): ConnectionGeometry {
  return connectionGeometry(
    live ? liveRect(fromItem) : getItemRect(fromItem),
    live ? liveRect(toItem) : getItemRect(toItem),
  )
}

const rendered = computed<RenderedConnection[]>(() =>
  board.connections.flatMap((entry) => {
    const fromItem = itemForCard(entry.fromCardId)
    const toItem = itemForCard(entry.toCardId)
    if (!fromItem || !toItem) return []

    return [
      {
        connection: entry,
        geometry: geometryForPair(fromItem, toItem),
        dimmed: isConnectionDimmed(entry, board.activeFilterTag, board.cards),
      },
    ]
  }),
)

const draft = computed(() => {
  if (!connection.isConnecting.value || !connection.fromItemId.value) {
    return null
  }

  const source = board.items.find(
    (item) => item.id === connection.fromItemId.value,
  )
  if (!source) return null

  const pointer = connection.pointerWorld.value
  if (!pointer) return null

  const target = connection.targetItemId.value
    ? board.items.find((item) => item.id === connection.targetItemId.value)
    : null

  // The drafting wire always follows the cursor from the handle; the final
  // auto-docked shape is applied on release. The target is only used for the
  // capture ring.
  const geometry = draftGeometry(getItemRect(source), pointer, 'right')

  return { geometry, source, target }
})

const snapRect = computed<Rect | null>(() => {
  if (!draft.value?.target) return null

  const rect = getItemRect(draft.value.target)
  return {
    x: rect.x - 7,
    y: rect.y - 7,
    width: rect.width + 14,
    height: rect.height + 14,
  }
})

function isSelected(connectionId: string) {
  return board.selectedConnectionId === connectionId
}

function isEditing(connectionId: string) {
  return connection.editingConnectionId.value === connectionId
}

function selectConnection(connectionId: string) {
  connection.stopLabelEdit()
  board.selectConnection(connectionId)
}

function beginLabelEdit(connectionId: string) {
  connection.startLabelEdit(connectionId)
}

function commitLabel() {
  const connectionId = connection.editingConnectionId.value
  if (!connectionId) return

  const value = labelDraft.value
  connection.stopLabelEdit()
  void board.updateConnectionLabel(connectionId, value)
}

function cancelLabel() {
  connection.stopLabelEdit()
  labelDraft.value = ''
}

watch(
  () => connection.editingConnectionId.value,
  async (connectionId) => {
    if (!connectionId) {
      labelDraft.value = ''
      return
    }

    const entry = board.connections.find(
      (candidate) => candidate.id === connectionId,
    )
    labelDraft.value = entry?.label ?? ''
    await nextTick()
    labelInput.value?.focus()
    labelInput.value?.select()
  },
)

function setPath(group: Element, selector: string, path: string) {
  const element = group.querySelector(selector)
  element?.setAttribute('d', path)
}

function setCircle(group: Element, selector: string, x: number, y: number) {
  const circle = group.querySelector(selector)
  circle?.setAttribute('cx', String(x))
  circle?.setAttribute('cy', String(y))
}

function setLabelPosition(group: Element, geometry: ConnectionGeometry) {
  const label = group.querySelector('[data-label-for]')
  label?.setAttribute('x', String(geometry.midpoint.x - 110))
  label?.setAttribute('y', String(geometry.midpoint.y - 16))
}

function refreshLivePathsForCards(cardIds: Set<string>) {
  const svg = svgRoot.value
  if (!svg || !cardIds.size) return

  const itemsByCard = new Map(board.items.map((item) => [item.cardId, item]))

  for (const entry of connectionsTouchingCards(board.connections, cardIds)) {
    const fromItem = itemsByCard.get(entry.fromCardId)
    const toItem = itemsByCard.get(entry.toCardId)
    if (!fromItem || !toItem) continue

    const group = svg.querySelector(`[data-connection-id="${entry.id}"]`)
    if (!group) continue

    const geometry = geometryForPair(fromItem, toItem, true)
    setPath(group, '[data-hit]', geometry.path)
    setPath(group, '[data-line]', geometry.path)
    setCircle(group, '[data-start-dot]', geometry.start.x, geometry.start.y)
    setCircle(group, '[data-end-dot]', geometry.end.x, geometry.end.y)
    setLabelPosition(group, geometry)
  }
}

const disposeDragBatch = subscribeCardDragBatch((event) => {
  const cardIds = new Set<string>()
  for (const item of event.items) {
    livePositions.set(item.itemId, { x: item.x, y: item.y })
    cardIds.add(item.cardId)
  }
  refreshLivePathsForCards(cardIds)
})

const disposeDragEndBatch = subscribeCardDragEndBatch((event) => {
  const cardIds = new Set<string>()
  for (const item of event.items) {
    livePositions.delete(item.itemId)
    cardIds.add(item.cardId)
  }

  requestAnimationFrame(() => refreshLivePathsForCards(cardIds))
})

onBeforeUnmount(() => {
  disposeDragBatch()
  disposeDragEndBatch()
})
</script>

<template>
  <svg
    ref="svgRoot"
    class="connection-layer"
    width="1"
    height="1"
    role="group"
    aria-label="卡片连线"
  >
    <rect
      v-if="snapRect"
      class="connection-snap-ring"
      :x="snapRect.x"
      :y="snapRect.y"
      :width="snapRect.width"
      :height="snapRect.height"
      rx="24"
    />

    <g
      v-for="entry in rendered"
      :key="entry.connection.id"
      :data-connection-id="entry.connection.id"
      class="connection-group"
      :class="{
        'is-dimmed': entry.dimmed,
        'is-spotlight': Boolean(board.activeFilterTag) && !entry.dimmed,
      }"
      :data-dimmed="entry.dimmed ? 'true' : undefined"
    >
      <path
        data-hit
        class="connection-hit"
        :d="entry.geometry.path"
        role="button"
        tabindex="0"
        :aria-pressed="isSelected(entry.connection.id)"
        :aria-label="
          entry.connection.label
            ? `连线：${entry.connection.label}。按 Enter 编辑说明，Delete 删除`
            : '卡片连线。按 Enter 编辑说明，Delete 删除'
        "
        @focus="selectConnection(entry.connection.id)"
        @pointerenter="hoveredId = entry.connection.id"
        @pointerleave="hoveredId = null"
        @pointerdown.stop.prevent="selectConnection(entry.connection.id)"
        @click.stop
        @dblclick.stop.prevent="beginLabelEdit(entry.connection.id)"
      />
      <path
        data-line
        class="connection-line"
        aria-hidden="true"
        :class="{
          'is-selected': isSelected(entry.connection.id),
          'is-hovered': hoveredId === entry.connection.id,
        }"
        :d="entry.geometry.path"
      />
      <circle
        data-start-dot
        class="connection-dot"
        :class="{ 'is-selected': isSelected(entry.connection.id) }"
        :cx="entry.geometry.start.x"
        :cy="entry.geometry.start.y"
        r="2.4"
      />
      <circle
        data-end-dot
        class="connection-dot"
        :class="{ 'is-selected': isSelected(entry.connection.id) }"
        :cx="entry.geometry.end.x"
        :cy="entry.geometry.end.y"
        r="3"
      />

      <foreignObject
        v-if="isEditing(entry.connection.id) || entry.connection.label"
        :data-label-for="entry.connection.id"
        class="connection-label-object"
        :x="entry.geometry.midpoint.x - 110"
        :y="entry.geometry.midpoint.y - 16"
        width="220"
        height="32"
      >
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          class="connection-label-shell"
        >
          <input
            v-if="isEditing(entry.connection.id)"
            :ref="setLabelInput"
            v-model="labelDraft"
            class="connection-label-input"
            type="text"
            maxlength="120"
            placeholder="关系说明…"
            aria-label="连线关系说明"
            @pointerdown.stop
            @click.stop
            @keydown.enter.prevent.stop="commitLabel"
            @keydown.esc.prevent.stop="cancelLabel"
            @blur="commitLabel"
          />
          <button
            v-else
            type="button"
            class="connection-label-pill"
            :title="entry.connection.label"
            @pointerdown.stop
            @click.stop="selectConnection(entry.connection.id)"
            @dblclick.stop.prevent="beginLabelEdit(entry.connection.id)"
          >
            {{ entry.connection.label }}
          </button>
        </div>
      </foreignObject>
    </g>

    <g v-if="draft" class="connection-draft-group">
      <path class="connection-draft" :d="draft.geometry.path" />
      <circle
        class="connection-dot is-draft"
        :cx="draft.geometry.start.x"
        :cy="draft.geometry.start.y"
        r="2.4"
      />
      <circle
        class="connection-dot is-draft"
        :cx="draft.geometry.end.x"
        :cy="draft.geometry.end.y"
        r="3"
      />
    </g>
  </svg>
</template>

<style scoped>
.connection-layer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  overflow: visible;
  pointer-events: none;
}

.connection-group {
  pointer-events: none;
  transition: opacity 300ms ease;
}

.connection-group.is-dimmed {
  opacity: 0.15;
}

.connection-group.is-spotlight .connection-line:not(.is-selected) {
  stroke: rgba(87, 83, 78, 0.72);
}

.connection-group.is-spotlight .connection-dot:not(.is-selected) {
  fill: rgba(87, 83, 78, 0.78);
}

.connection-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 20;
  vector-effect: non-scaling-stroke;
  pointer-events: stroke;
  cursor: pointer;
}

.connection-line {
  fill: none;
  stroke: rgba(120, 113, 108, 0.42);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
  transition:
    stroke 160ms ease,
    opacity 160ms ease;
}

.connection-line.is-hovered {
  stroke: rgba(87, 83, 78, 0.72);
}

.connection-line.is-selected {
  stroke: rgb(180, 83, 9);
  filter: drop-shadow(0 0 3px rgba(217, 119, 6, 0.45));
}

.connection-dot {
  fill: rgba(120, 113, 108, 0.6);
  pointer-events: none;
}

.connection-dot.is-selected {
  fill: rgb(180, 83, 9);
}

.connection-dot.is-draft {
  fill: rgba(217, 119, 6, 0.75);
}

.connection-draft {
  fill: none;
  stroke: rgba(217, 119, 6, 0.88);
  stroke-width: 2;
  stroke-dasharray: 6 5;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 0 3px rgba(217, 119, 6, 0.35));
  animation: connection-march 900ms linear infinite;
}

.connection-snap-ring {
  fill: rgba(217, 119, 6, 0.035);
  stroke: rgba(217, 119, 6, 0.42);
  stroke-width: 1.5;
  stroke-dasharray: 5 5;
  vector-effect: non-scaling-stroke;
}

.connection-label-object {
  overflow: visible;
  pointer-events: none;
}

.connection-label-shell {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.connection-label-pill {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(214, 211, 209, 0.85);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.82);
  padding: 3px 10px;
  font-size: 10px;
  line-height: 1.4;
  color: rgb(87, 83, 78);
  pointer-events: auto;
  box-shadow: 0 2px 10px -6px rgba(41, 37, 36, 0.4);
  backdrop-filter: blur(8px);
  cursor: pointer;
}

.connection-label-input {
  width: 200px;
  height: 26px;
  border: 1px solid rgba(217, 119, 6, 0.4);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.96);
  padding: 0 10px;
  font-size: 10px;
  color: rgb(68, 64, 60);
  text-align: center;
  outline: none;
  pointer-events: auto;
  box-shadow: 0 4px 16px -8px rgba(41, 37, 36, 0.5);
}

.connection-label-input::placeholder {
  color: rgba(168, 162, 158, 0.9);
}

.dark .connection-line {
  stroke: rgba(228, 228, 231, 0.28);
}

.dark .connection-line.is-hovered {
  stroke: rgba(244, 244, 245, 0.55);
}

.dark .connection-line.is-selected {
  stroke: rgb(147, 197, 253);
  filter: drop-shadow(0 0 4px rgba(147, 197, 253, 0.5));
}

.dark .connection-dot {
  fill: rgba(228, 228, 231, 0.4);
}

.dark .connection-dot.is-selected {
  fill: rgb(147, 197, 253);
}

.dark .connection-dot.is-draft {
  fill: rgba(147, 197, 253, 0.8);
}

.dark .connection-draft {
  stroke: rgba(147, 197, 253, 0.85);
  filter: drop-shadow(0 0 4px rgba(147, 197, 253, 0.4));
}

.dark .connection-snap-ring {
  fill: rgba(147, 197, 253, 0.04);
  stroke: rgba(147, 197, 253, 0.4);
}

.dark .connection-group.is-spotlight .connection-line:not(.is-selected) {
  stroke: rgba(244, 244, 245, 0.55);
}

.dark .connection-group.is-spotlight .connection-dot:not(.is-selected) {
  fill: rgba(244, 244, 245, 0.62);
}

.dark .connection-label-pill {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(24, 24, 27, 0.86);
  color: rgb(212, 212, 216);
}

.dark .connection-label-input {
  border-color: rgba(147, 197, 253, 0.4);
  background: rgba(24, 24, 27, 0.96);
  color: rgb(228, 228, 231);
}

@keyframes connection-march {
  to {
    stroke-dashoffset: -20;
  }
}
</style>
