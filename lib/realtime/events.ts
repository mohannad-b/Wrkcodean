/**
 * Simple in-memory event emitter for realtime chat events.
 * In production, this should use Redis pub/sub or similar.
 */

export type ChatEventType =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "typing.started"
  | "typing.stopped"
  | "presence.updated"
  | "readreceipt.updated";

export type ChatEvent = {
  type: ChatEventType;
  conversationId: string;
  workflowId: string;
  tenantId: string;
  data: unknown;
  timestamp: string;
};

type EventListener = (event: ChatEvent) => void;

class ChatEventEmitter {
  private listeners: Map<string, Set<EventListener>> = new Map();

  /**
   * Subscribe to events for a conversation
   */
  subscribe(conversationId: string, listener: EventListener): () => void {
    if (!this.listeners.has(conversationId)) {
      this.listeners.set(conversationId, new Set());
    }
    this.listeners.get(conversationId)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(conversationId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(conversationId);
        }
      }
    };
  }

  /**
   * Emit an event to all subscribers of a conversation
   */
  emit(event: ChatEvent): void {
    const listeners = this.listeners.get(event.conversationId);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error("Error in event listener:", error);
        }
      });
    }
  }

  /**
   * Get subscriber count for a conversation (for debugging)
   */
  getSubscriberCount(conversationId: string): number {
    return this.listeners.get(conversationId)?.size ?? 0;
  }
}

// Singleton instance
export const chatEventEmitter = new ChatEventEmitter();

/**
 * Helper to emit chat events
 */
export function emitChatEvent(params: {
  type: ChatEventType;
  conversationId: string;
  workflowId: string;
  tenantId: string;
  data: unknown;
}): void {
  chatEventEmitter.emit({
    ...params,
    timestamp: new Date().toISOString(),
  });
}

