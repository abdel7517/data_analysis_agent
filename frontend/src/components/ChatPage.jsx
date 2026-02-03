import { useState } from 'react'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { useChat } from '@/hooks/useChat'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

export function ChatPage() {
  const [email, setEmail] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  const { messages, streamingBlocks, isLoading, sendMessage, clearMessages } =
    useChat(email)

  const handleConnect = (e) => {
    e.preventDefault()
    if (email.trim()) {
      setIsConnected(true)
    }
  }

  const handleDisconnect = () => {
    clearMessages()
    setIsConnected(false)
    setEmail('')
  }

  // Ecran de connexion
  if (!isConnected) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <form onSubmit={handleConnect} className="w-full max-w-sm space-y-6 px-4">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bot />
              </EmptyMedia>
              <EmptyTitle>Data Analysis Agent</EmptyTitle>
              <EmptyDescription>
                Posez des questions sur vos donnees, obtenez des visualisations
                et des analyses interactives.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="w-full space-y-3">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  className="text-center"
                />
                <Button type="submit" className="w-full">
                  Commencer
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        </form>
      </div>
    )
  }

  // Interface de chat
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-semibold">Data Analysis Agent</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{email}</span>
          <Separator orientation="vertical" className="h-4" />
          <Button variant="ghost" size="sm" onClick={handleDisconnect}>
            Deconnexion
          </Button>
        </div>
      </header>

      {/* Zone des messages */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-3xl mx-auto flex flex-col">
          {messages.length === 0 && !isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Bot />
                  </EmptyMedia>
                  <EmptyTitle>Comment puis-je vous aider ?</EmptyTitle>
                  <EmptyDescription>
                    Posez une question sur vos donnees pour commencer l'analyse.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <MessageList
              messages={messages}
              streamingBlocks={streamingBlocks}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>

      {/* Zone de saisie */}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  )
}
