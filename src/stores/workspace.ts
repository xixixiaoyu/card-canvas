import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * Workspace UI state. Persistent entities live in Dexie; high-frequency
 * viewport motion lives in useCanvas; this store only keeps board and
 * selection state that changes at human speed.
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const activeBoardId = ref('board-main')
  const activeBoardName = ref('未命名白板')
  const selectedCardId = ref<string | null>(null)
  const isInboxOpen = ref(false)

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
    selectedCardId,
    isInboxOpen,
    selectCard,
    openInbox,
    closeInbox,
  }
})
