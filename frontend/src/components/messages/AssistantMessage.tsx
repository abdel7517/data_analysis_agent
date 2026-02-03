import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Bot, AlertCircle } from 'lucide-react'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { PlotlyChart } from './PlotlyChart'
import { DataTable } from './DataTable'
import { StreamingText } from './StreamingText'
import { BlockType } from '@/types/chat'
import type { Block } from '@/types/chat'

interface BlockRendererProps {
  block: Block
  isLastBlock: boolean
  isStreaming: boolean
}

interface AssistantMessageProps {
  blocks: Block[]
  isStreaming?: boolean
}

function BlockRenderer({ block, isLastBlock, isStreaming }: BlockRendererProps) {
  switch (block.type) {
    case BlockType.THINKING:
      return (
        <ThinkingBlock
          content={block.content}
          isStreaming={isStreaming && isLastBlock}
        />
      )

    case BlockType.TEXT:
      return (
        <StreamingText
          content={block.content}
          isStreaming={isStreaming && isLastBlock}
        />
      )

    case BlockType.TOOL_CALL:
      return (
        <ToolCallBlock
          name={block.name}
          args={block.args}
          result={block.result}
          status={block.status}
        />
      )

    case BlockType.PLOTLY:
      return <PlotlyChart json={block.json} />

    case BlockType.DATA_TABLE:
      return <DataTable json={block.json} />

    case BlockType.ERROR:
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{block.message}</AlertDescription>
        </Alert>
      )

    default:
      return null
  }
}

export function AssistantMessage({ blocks, isStreaming = false }: AssistantMessageProps) {
  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 flex-shrink-0 mt-1">
        <AvatarFallback className="bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 space-y-3">
        {blocks.map((block, i) => (
          <BlockRenderer
            key={block.id || i}
            block={block}
            isLastBlock={i === blocks.length - 1}
            isStreaming={isStreaming}
          />
        ))}
      </div>
    </div>
  )
}
