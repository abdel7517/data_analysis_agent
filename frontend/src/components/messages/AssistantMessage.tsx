import { memo } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Bot, AlertCircle, AlertTriangle } from 'lucide-react'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { PlotlyChart } from './PlotlyChart'
import { DataTable } from './DataTable'
import { FinalAnswer } from './FinalAnswer'
import { BlockType } from '@/types/chat'
import type { Block } from '@/types/chat'

interface BlockRendererProps {
  block: Block
  isActive: boolean
}

interface AssistantMessageProps {
  blocks: Block[]
}

const BlockRenderer = memo(function BlockRenderer({ block, isActive }: BlockRendererProps) {
  switch (block.type) {
    case BlockType.THINKING:
      return (
        <ThinkingBlock
          content={block.content}
          done={block.done}
          isActive={isActive}
        />
      )

    case BlockType.TEXT:
      return <FinalAnswer content={block.content} />

    case BlockType.TOOL_CALL:
      return (
        <ToolCallBlock
          name={block.name}
          args={block.args}
          result={block.result}
          isActive={isActive}
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

    case BlockType.WARNING:
      return (
        <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            {block.message}
          </AlertDescription>
        </Alert>
      )

    default:
      return null
  }
})

export function AssistantMessage({ blocks }: AssistantMessageProps) {
  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 flex-shrink-0 mt-1">
        <AvatarFallback className="bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 space-y-3">
        {blocks.map((block, i) => {
          const nextBlock = blocks[i + 1]
          // Un bloc est "actif" tant qu'il n'est pas terminé,
          // ou que le bloc suivant n'est pas terminé (garde le collapsible ouvert)
          const isActive = !block.done || (!!nextBlock && !nextBlock.done)

          return (
            <BlockRenderer
              key={block.id || i}
              block={block}
              isActive={isActive}
            />
          )
        })}
      </div>
    </div>
  )
}
