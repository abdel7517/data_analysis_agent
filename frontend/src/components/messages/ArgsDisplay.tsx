import { Fragment, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface ArgsDisplayProps {
  args: Record<string, unknown> | string
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        null
      </Badge>
    )
  }

  if (typeof value === 'boolean') {
    return (
      <Badge variant="outline" className="text-[10px] text-violet-500 border-violet-300">
        {String(value)}
      </Badge>
    )
  }

  if (typeof value === 'number') {
    return (
      <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-300">
        {String(value)}
      </Badge>
    )
  }

  if (typeof value === 'string') {
    return (
      <span className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
        {value}
      </span>
    )
  }

  // object / array
  return (
    <pre className="text-[11px] font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function ArgsDisplay({ args }: ArgsDisplayProps) {
  const parsed = useMemo(() => {
    if (typeof args === 'string') {
      try {
        return JSON.parse(args) as Record<string, unknown>
      } catch {
        return { value: args }
      }
    }
    return args
  }, [args])

  const entries = Object.entries(parsed)

  if (entries.length === 0) return null

  return (
    <div className="mt-1.5 space-y-0">
      {entries.map(([key, value], i) => (
        <Fragment key={key}>
          <div className="flex items-start gap-2.5 py-1.5 px-1">
            <Badge variant="secondary" className="text-[10px] font-mono shrink-0 mt-0.5">
              {key}
            </Badge>
            {formatValue(value)}
          </div>
          {i < entries.length - 1 && <Separator className="opacity-50" />}
        </Fragment>
      ))}
    </div>
  )
}
