import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Viewport } from '../types'

/**
 * Workspace UI state. Persistent entities deliberately live in Dexie; this
 * store only keeps ephemeral viewport and selection state.
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const activeBoardId = ref('board-main')
  const activeBoardName = ref('未命名白板')
  const viewport = ref<Viewport>({ panX: 0, panY: 0, scale: 1 })
  const selectedCardId = ref<string | null>(null)
  const isInboxOpen = ref(false)

  const zoomLabel = computed(() => `${Math.round(viewport.value.scale * 100)}%`)

  function resetViewport() {
    viewport.value = { panX: 0, panY: 0, scale: 1 }
  }

  function selectCard(cardId: string | null) {
    selectedCardId.value = cardId
  }

  function openInbox() {
    isInboxOpen.value = true
  }

  function closeInbox() {
    isInboxOpen.value = false
  }

  return {
    activeBoardId,
    activeBoardName,
    viewport,
    selectedCardId,
    isInboxOpen,
    zoomLabel,
    resetViewport,
    selectCard,
    openInbox,
    closeInbox,
  }
})
