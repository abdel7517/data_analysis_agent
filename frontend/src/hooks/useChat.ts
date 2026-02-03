import { useState, useRef, useCallback } from 'react'
import { useSSE } from './useSSE'
import type { Block, BlockWithoutId, Message, SSEEvent } from '@/types/chat'

let blockIdCounter = 0
const nextBlockId = () => `block-${++blockIdCounter}`
let messageIdCounter = 0
const nextMessageId = () => `msg-${++messageIdCounter}`

export function useChat(email: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingBlocks, setStreamingBlocks] = useState<Block[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const blocksRef = useRef<Block[]>([])

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
      (b) => b.type === 'tool_call' && b.status === 'running'
    )
    if (idx !== -1) {
      const updated = [...blocks]
      updated[idx] = { ...updated[idx], status: 'done' } as Block
      blocksRef.current = updated
    }
  }

  // --- Gestionnaire SSE ---

  const handleSSEMessage = useCallback((data: SSEEvent) => {
    if (!data.type) return

    switch (data.type) {
      case 'thinking': {
        const last = getLastBlock()
        if (last && last.type === 'thinking') {
          updateLastBlock((b) => ({
            ...b,
            content: (b as { content: string }).content + (data.data.content as string),
          }))
        } else {
          addBlock({ type: 'thinking', content: data.data.content as string })
        }
        break
      }

      case 'text': {
        const last = getLastBlock()
        if (last && last.type === 'text') {
          updateLastBlock((b) => ({
            ...b,
            content: (b as { content: string }).content + (data.data.content as string),
          }))
        } else {
          addBlock({ type: 'text', content: data.data.content as string })
        }
        break
      }

      case 'tool_call_start': {
        addBlock({
          type: 'tool_call',
          name: data.data.name as string,
          args: data.data.args as Record<string, unknown>,
          result: null,
          status: 'running',
        })
        break
      }

      case 'tool_call_result': {
        const blocks = blocksRef.current
        const idx = blocks.findLastIndex(
          (b) => b.type === 'tool_call' && b.status === 'running'
        )
        if (idx !== -1) {
          const updated = [...blocks]
          updated[idx] = {
            ...updated[idx],
            result: data.data.result as string,
            status: 'done',
          } as Block
          blocksRef.current = updated
          updateBlocks()
        }
        break
      }

      case 'plotly': {
        markLastToolCallDone()
        addBlock({ type: 'plotly', json: data.data.json as string })
        break
      }

      case 'data_table': {
        markLastToolCallDone()
        addBlock({ type: 'data_table', json: data.data.json as string })
        break
      }

      case 'done': {
        const finalBlocks = [...blocksRef.current]
        if (finalBlocks.length > 0) {
          setMessages((prev) => [
            ...prev,
            { id: nextMessageId(), role: 'assistant' as const, blocks: finalBlocks },
          ])
        }
        blocksRef.current = []
        setStreamingBlocks([])
        setIsLoading(false)
        break
      }

      case 'error': {
        addBlock({ type: 'error', message: data.data.message as string })
        const finalBlocks = [...blocksRef.current]
        setMessages((prev) => [
          ...prev,
          { id: nextMessageId(), role: 'assistant' as const, blocks: finalBlocks },
        ])
        blocksRef.current = []
        setStreamingBlocks([])
        setIsLoading(false)
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
              { id: nextBlockId(), type: 'error' as const, message: 'Erreur de connexion au serveur.' },
            ],
          },
        ])
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
    setIsLoading(false)
    disconnect()
  }, [disconnect])

  return { messages, streamingBlocks, isLoading, sendMessage, clearMessages }
}
