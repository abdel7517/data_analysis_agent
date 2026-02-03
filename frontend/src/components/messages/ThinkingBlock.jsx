import { useState } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export function ThinkingBlock({ content, isStreaming = false }) {
  const [isOpen, setIsOpen] = useState(isStreaming)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1 group">
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            isOpen && 'rotate-90'
          )}
        />
        <Brain className="h-3.5 w-3.5" />
        <span className="font-medium">Reflexion</span>
        {isStreaming && (
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-7 mt-1 rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
