import { useState, useEffect, useRef, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Brain, ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface ThinkingBlockProps {
  content: string
  done: boolean
  isActive?: boolean
}

export const ThinkingBlock = memo(function ThinkingBlock({ content, done, isActive = false }: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(isActive)
  const [isClosing, setIsClosing] = useState(false)
  const hasBeenActive = useRef(false)

  useEffect(() => {
    if (isActive) {
      hasBeenActive.current = true
      setIsOpen(true)
      setIsClosing(false)
    } else if (hasBeenActive.current) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsOpen(false)
        setIsClosing(false)
      }, 1600)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full overflow-hidden">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1 group">
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            isOpen && 'rotate-90'
          )}
        />
        <Brain className="h-3.5 w-3.5" />
        <span className="font-medium">Reflexion</span>
        {!done && (
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(
        "overflow-hidden transition-opacity duration-1000 data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up",
        isClosing ? "opacity-30" : "opacity-100"
      )}>
        <div className="ml-7 mt-1 rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed max-w-full overflow-x-auto break-words [word-break:break-word]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre: ({ children }) => (
                <pre className="rounded-md border bg-muted p-3 overflow-x-auto text-foreground max-w-full">
                  {children}
                </pre>
              ),
              code: ({ children, className }) => {
                const isBlock = Boolean(className)
                return isBlock ? (
                  <code className={cn('text-xs', className)}>{children}</code>
                ) : (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-foreground font-mono text-[0.85em]">
                    {children}
                  </code>
                )
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})
