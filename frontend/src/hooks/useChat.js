import { useState, useRef, useCallback } from 'react'
import { useSSE } from './useSSE'

let blockIdCounter = 0
const nextBlockId = () => `block-${++blockIdCounter}`
let messageIdCounter = 0
const nextMessageId = () => `msg-${++messageIdCounter}`

/**
 * Hook centralisant la logique du chat :
 * - Accumulation des événements SSE en blocs typés
 * - Gestion des messages (user + assistant)
 * - Envoi de messages via POST /api/chat
 *
 * @param {string} email - Email de l'utilisateur (canal SSE)
 * @returns {{ messages, streamingBlocks, isLoading, sendMessage }}
 */
export function useChat(email) {
  const [messages, setMessages] = useState([])
  const [streamingBlocks, setStreamingBlocks] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const blocksRef = useRef([])

  // --- Helpers d'accumulation ---

  const getLastBlock = () => {
    const blocks = blocksRef.current
    return blocks.length > 0 ? blocks[blocks.length - 1] : null
  }

  const updateBlocks = () => {
    setStreamingBlocks([...blocksRef.current])
  }

  const addBlock = (block) => {
    blocksRef.current = [...blocksRef.current, { ...block, id: nextBlockId() }]
    updateBlocks()
  }

  const updateLastBlock = (updater) => {
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
      updated[idx] = { ...updated[idx], status: 'done' }
      blocksRef.current = updated
    }
  }

  // --- Gestionnaire SSE ---

  const handleSSEMessage = useCallback((data) => {
    if (!data.type) return

    switch (data.type) {
      case 'thinking': {
        const last = getLastBlock()
        if (last && last.type === 'thinking') {
          updateLastBlock((b) => ({
            ...b,
            content: b.content + data.data.content,
          }))
        } else {
          addBlock({ type: 'thinking', content: data.data.content })
        }
        break
      }

      case 'text': {
        const last = getLastBlock()
        if (last && last.type === 'text') {
          updateLastBlock((b) => ({
            ...b,
            content: b.content + data.data.content,
          }))
        } else {
          addBlock({ type: 'text', content: data.data.content })
        }
        break
      }

      case 'tool_call_start': {
        addBlock({
          type: 'tool_call',
          name: data.data.name,
          args: data.data.args,
          result: null,
          status: 'running',
        })
        break
      }

      case 'tool_call_result': {
        // Trouver le dernier tool_call running et y mettre le résultat
        const blocks = blocksRef.current
        const idx = blocks.findLastIndex(
          (b) => b.type === 'tool_call' && b.status === 'running'
        )
        if (idx !== -1) {
          const updated = [...blocks]
          updated[idx] = {
            ...updated[idx],
            result: data.data.result,
            status: 'done',
          }
          blocksRef.current = updated
          updateBlocks()
        }
        break
      }

      case 'plotly': {
        markLastToolCallDone()
        addBlock({ type: 'plotly', json: data.data.json })
        break
      }

      case 'data_table': {
        markLastToolCallDone()
        addBlock({ type: 'data_table', json: data.data.json })
        break
      }

      case 'done': {
        const finalBlocks = [...blocksRef.current]
        if (finalBlocks.length > 0) {
          setMessages((prev) => [
            ...prev,
            { id: nextMessageId(), role: 'assistant', blocks: finalBlocks },
          ])
        }
        blocksRef.current = []
        setStreamingBlocks([])
        setIsLoading(false)
        break
      }

      case 'error': {
        addBlock({ type: 'error', message: data.data.message })
        const finalBlocks = [...blocksRef.current]
        setMessages((prev) => [
          ...prev,
          { id: nextMessageId(), role: 'assistant', blocks: finalBlocks },
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
    async (text) => {
      if (!text.trim() || isLoading || !email) return

      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: 'user', content: text.trim() },
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
            role: 'assistant',
            blocks: [
              { id: nextBlockId(), type: 'error', message: 'Erreur de connexion au serveur.' },
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
