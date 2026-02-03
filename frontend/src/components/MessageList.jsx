import { useEffect, useRef } from 'react'
import { UserMessage } from './messages/UserMessage'
import { AssistantMessage } from './messages/AssistantMessage'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot } from 'lucide-react'

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 flex-shrink-0 mt-1">
        <AvatarFallback className="bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="space-y-2 pt-1">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[180px]" />
      </div>
    </div>
  )
}

export function MessageList({ messages, streamingBlocks, isLoading }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingBlocks])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {messages.map((msg) =>
        msg.role === 'user' ? (
          <UserMessage key={msg.id} content={msg.content} />
        ) : (
          <AssistantMessage key={msg.id} blocks={msg.blocks} />
        )
      )}

      {/* Blocs en cours de streaming */}
      {isLoading && streamingBlocks.length > 0 && (
        <AssistantMessage blocks={streamingBlocks} isStreaming />
      )}

      {/* Indicateur de typing (aucun bloc encore reçu) */}
      {isLoading && streamingBlocks.length === 0 && <TypingIndicator />}

      <div ref={endRef} />
    </div>
  )
}
