import { useState, useRef, useCallback } from 'react'
import { useSSE } from './useSSE'
import { SSEEventType, BlockType, ToolCallStatus } from '@/types/chat'
import type { Block, BlockWithoutId, Message, SSEEvent } from '@/types/chat'

let blockIdCounter = 0
const nextBlockId = () => `block-${++blockIdCounter}`
let messageIdCounter = 0
const nextMessageId = () => `msg-${++messageIdCounter}`

export function useChat(email: string) {
  const [messages, setMessages] = useState<Message[]>([])
  // State provoquant le rendu des blocs en streaming
  const [streamingBlocks, setStreamingBlocks] = useState<Block[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const blocksRef = useRef<Block[]>([])
  const streamingMessageIdRef = useRef<string | null>(null)

  // --- Helpers d'accumulation ---

  const getLastBlock = (): Block | null => {
    const blocks = blocksRef.current
    return blocks.length > 0 ? blocks[blocks.length - 1] : null
  }

  const updateBlocks = () => {
    setStreamingBlocks([...blocksRef.current])
  }

  const addBlock = (block: BlockWithoutId) => {
    blocksRef.current = [...blocksRef.current, { ...block, id: nextBlockId() } as Block]
    updateBlocks()
  }

  const updateLastBlock = (updater: (block: Block) => Block) => {
    const blocks = blocksRef.current
    if (blocks.length === 0) return
    const last = blocks[blocks.length - 1]
    blocksRef.current = [...blocks.slice(0, -1), updater(last)]
    updateBlocks()
  }

  const markLastToolCallDone = () => {
    const blocks = blocksRef.current
    const idx = blocks.findLastIndex(
      (b) => b.type === BlockType.TOOL_CALL && b.status === ToolCallStatus.RUNNING
    )
    if (idx !== -1) {
      const block = blocks[idx]
      if (block.type === BlockType.TOOL_CALL) {
        const updated = [...blocks]
        updated[idx] = { ...block, status: ToolCallStatus.DONE }
        blocksRef.current = updated
      }
    }
  }

  // --- Gestionnaire SSE ---

  const handleSSEMessage = useCallback((data: SSEEvent) => {
    if (!data.type) return

    switch (data.type) {
      case SSEEventType.THINKING: {
        const last = getLastBlock()
        if (last && last.type === BlockType.THINKING) {
          updateLastBlock((b) => {
            if (b.type !== BlockType.THINKING) return b
            return { ...b, content: b.content + data.data.content }
          })
        } else {
          addBlock({ type: BlockType.THINKING, content: data.data.content })
        }
        break
      }

      case SSEEventType.TEXT: {
        const last = getLastBlock()
        if (last && last.type === BlockType.TEXT) {
          updateLastBlock((b) => {
            if (b.type !== BlockType.TEXT) return b
            return { ...b, content: b.content + data.data.content }
          })
        } else {
          addBlock({ type: BlockType.TEXT, content: data.data.content })
        }
        break
      }

      case SSEEventType.TOOL_CALL_START: {
        addBlock({
          type: BlockType.TOOL_CALL,
          name: data.data.name,
          args: data.data.args,
          result: null,
          status: ToolCallStatus.RUNNING,
        })
        break
      }

      case SSEEventType.TOOL_CALL_RESULT: {
        const blocks = blocksRef.current
        const idx = blocks.findLastIndex(
          (b) => b.type === BlockType.TOOL_CALL && b.status === ToolCallStatus.RUNNING
        )
        if (idx !== -1) {
          const block = blocks[idx]
          if (block.type === BlockType.TOOL_CALL) {
            const updated = [...blocks]
            updated[idx] = { ...block, result: data.data.result, status: ToolCallStatus.DONE }
            blocksRef.current = updated
            updateBlocks()
          }
        }
        break
      }

      case SSEEventType.PLOTLY: {
        markLastToolCallDone()
        addBlock({ type: BlockType.PLOTLY, json: data.data.json })
        break
      }

      case SSEEventType.DATA_TABLE: {
        markLastToolCallDone()
        addBlock({ type: BlockType.DATA_TABLE, json: data.data.json })
        break
      }

      case SSEEventType.DONE: {
        const finalBlocks = [...blocksRef.current]
        if (finalBlocks.length > 0) {
          const messageId = streamingMessageIdRef.current || nextMessageId()
          setMessages((prev) => [
            ...prev,
            { id: messageId, role: 'assistant' as const, blocks: finalBlocks },
          ])
        }
        blocksRef.current = []
        setStreamingBlocks([])
        setIsLoading(false)
        streamingMessageIdRef.current = null
        break
      }

      case SSEEventType.ERROR: {
        addBlock({ type: BlockType.ERROR, message: data.data.message })
        const finalBlocks = [...blocksRef.current]
        const messageId = streamingMessageIdRef.current || nextMessageId()
        setMessages((prev) => [
          ...prev,
          { id: messageId, role: 'assistant' as const, blocks: finalBlocks },
        ])
        blocksRef.current = []
        setStreamingBlocks([])
        setIsLoading(false)
        streamingMessageIdRef.current = null
        break
      }
    }
  }, [])

  const { connect, disconnect } = useSSE(email, handleSSEMessage)

  // --- Envoi de message ---

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || !email) return

      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: 'user' as const, content: text.trim() },
      ])
      setIsLoading(true)
      blocksRef.current = []
      setStreamingBlocks([])
      streamingMessageIdRef.current = nextMessageId()

      connect()

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, message: text.trim() }),
        })
        if (!res.ok) throw new Error('Erreur serveur')
      } catch (err) {
        console.error('Erreur envoi message:', err)
        setMessages((prev) => [
          ...prev,
          {
            id: nextMessageId(),
            role: 'assistant' as const,
            blocks: [
              { id: nextBlockId(), type: BlockType.ERROR, message: 'Erreur de connexion au serveur.' },
            ],
          },
        ])
        streamingMessageIdRef.current = null
        setIsLoading(false)
        disconnect()
      }
    },
    [email, isLoading, connect, disconnect]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setStreamingBlocks([])
    blocksRef.current = []
    streamingMessageIdRef.current = null
    setIsLoading(false)
    disconnect()
  }, [disconnect])

  return { messages, streamingBlocks, isLoading, sendMessage, clearMessages, streamingMessageId: streamingMessageIdRef.current }
}
