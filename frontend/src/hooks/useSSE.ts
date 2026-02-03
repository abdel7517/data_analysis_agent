import { useEffect, useRef, useCallback } from 'react'
import type { SSEEvent } from '@/types/chat'

export function useSSE(
  email: string,
  onMessage: (data: SSEEvent) => void,
  onError?: (error: Event) => void
) {
  const eventSourceRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (!email) return

    const url = `/api/stream/${encodeURIComponent(email)}`
    const eventSource = new EventSource(url)

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data: SSEEvent = JSON.parse(event.data)
        onMessage(data)
      } catch (e) {
        console.error('Erreur parsing SSE:', e)
      }
    }

    eventSource.onerror = (error: Event) => {
      console.error('Erreur SSE:', error)
      if (onError) onError(error)
      eventSource.close()
    }

    eventSourceRef.current = eventSource
  }, [email, onMessage, onError])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return { connect, disconnect }
}
