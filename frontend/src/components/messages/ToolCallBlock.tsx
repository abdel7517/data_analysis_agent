import { useEffect, useState, useRef, memo } from 'react'
import { Wrench, ChevronRight, Check } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ArgsDisplay } from './ArgsDisplay'

interface ToolCallBlockProps {
  name: string
  args: Record<string, unknown>
  result: string | null
  status: 'running' | 'done'
  isActive?: boolean
}

export const ToolCallBlock = memo(function ToolCallBlock({ name, args, result, status, isActive = false }: ToolCallBlockProps) {
  const [showArgs, setShowArgs] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const hasBeenActive = useRef(false)
  const isRunning = status === 'running'

  useEffect(() => {
    if (isActive) {
      hasBeenActive.current = true
      setShowArgs(true)
      setIsClosing(false)
    } else if (hasBeenActive.current) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setShowArgs(false)
        setShowResult(false)
        setIsClosing(false)
      }, 1600)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  useEffect(() => {
    if (isActive && result) setShowResult(true)
  }, [result, isActive])

  return (
    <Card
      className={cn(
        'w-full border-l-4 transition-colors',
        isRunning ? 'border-l-blue-500' : 'border-l-green-500'
      )}
    >
      <CardHeader className="px-4 py-2.5 flex flex-row items-center gap-3 space-y-0">
        <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-semibold flex-1">{name}</span>
        {isRunning ? (
          <Badge variant="secondary" className="gap-1.5">
            <Spinner className="h-3 w-3" />
            En cours
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
            <Check className="h-3 w-3" />
            Termine
          </Badge>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0 space-y-2">
        {/* Arguments (collapsible) */}
        {args && (
          <Collapsible open={showArgs} onOpenChange={setShowArgs}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight
                className={cn(
                  'h-3 w-3 transition-transform duration-200',
                  showArgs && 'rotate-90'
                )}
              />
              Arguments
            </CollapsibleTrigger>
            <CollapsibleContent className={cn(
              "overflow-hidden transition-opacity duration-1000 data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up",
              isClosing ? "opacity-30" : "opacity-100"
            )}>
              <ArgsDisplay args={args} />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Résultat (collapsible) */}
        {result && (
          <Collapsible open={showResult} onOpenChange={setShowResult}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight
                className={cn(
                  'h-3 w-3 transition-transform duration-200',
                  showResult && 'rotate-90'
                )}
              />
              Resultat
            </CollapsibleTrigger>
            <CollapsibleContent className={cn(
              "overflow-hidden transition-opacity duration-1000 data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up",
              isClosing ? "opacity-30" : "opacity-100"
            )}>
              <pre className="mt-1.5 rounded-md bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {result}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
})
