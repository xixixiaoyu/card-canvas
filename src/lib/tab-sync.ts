export type WorkspaceChangeType = 'cards' | 'items' | 'boards' | 'all'

interface WorkspaceChangeMessage {
  source: string
  type: WorkspaceChangeType
  boardId?: string
}

const CHANNEL_NAME = 'card-canvas:workspace'
const sourceId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `source-${Math.random().toString(36).slice(2)}`

let channel: BroadcastChannel | null = null

function getChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  channel ??= new BroadcastChannel(CHANNEL_NAME)
  return channel
}

/** Tell other tabs that durable workspace data changed. */
export function broadcastWorkspaceChange(
  type: WorkspaceChangeType,
  boardId?: string,
) {
  const bus = getChannel()
  if (!bus) return

  const message: WorkspaceChangeMessage = { source: sourceId, type, boardId }
  bus.postMessage(message)
}

/**
 * Subscribe to cross-tab changes. Returns a disposer so tests and HMR can
 * detach cleanly; the board store calls this only after it has hydrated.
 */
export function subscribeWorkspaceChange(
  handler: (change: WorkspaceChangeMessage) => void,
) {
  const bus = getChannel()
  if (!bus) return () => {}

  const listener = (event: MessageEvent<WorkspaceChangeMessage>) => {
    const message = event.data
    if (!message || message.source === sourceId) return
    handler(message)
  }

  bus.addEventListener('message', listener)

  return () => bus.removeEventListener('message', listener)
}
