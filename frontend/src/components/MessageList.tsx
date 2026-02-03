import { useEffect, useRef, useMemo } from 'react'
import { UserMessage } from './messages/UserMessage'
import { AssistantMessage } from './messages/AssistantMessage'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot } from 'lucide-react'
import type { Message, Block } from '@/types/chat'

interface MessageListProps {
  messages: Message[]
  streamingBlocks: Block[]
  isLoading: boolean
  streamingMessageId: string | null
}

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

export function MessageList({ messages, streamingBlocks, isLoading, streamingMessageId }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  const allMessages = useMemo(() => {
    if (isLoading && streamingBlocks.length > 0 && streamingMessageId) {
      return [
        ...messages,
        { id: streamingMessageId, role: 'assistant' as const, blocks: streamingBlocks },
      ]
    }
    return messages
  }, [messages, streamingBlocks, isLoading, streamingMessageId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages])

  return (
    <ScrollArea className="flex-1">
      <div className="px-4 py-6 space-y-6">
        {allMessages.map((msg) =>
          msg.role === 'user' ? (
            <UserMessage key={msg.id} content={msg.content} />
          ) : (
            <AssistantMessage
              key={msg.id}
              blocks={msg.blocks}
              isStreaming={isLoading && msg.id === streamingMessageId}
            />
          )
        )}

        {/* Indicateur de typing (aucun bloc encore reçu) */}
        {isLoading && streamingBlocks.length === 0 && <TypingIndicator />}

        <div ref={endRef} />
      </div>
    </ScrollArea>
  )
}
