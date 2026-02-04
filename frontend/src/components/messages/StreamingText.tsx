import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface StreamingTextProps {
  content: string
  done: boolean
}

export function StreamingText({ content, done }: StreamingTextProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
      {!done && (
        <span
          className={cn(
            'inline-block w-2 h-4 bg-foreground/70 ml-0.5 -mb-0.5',
            'animate-pulse'
          )}
        />
      )}
    </div>
  )
}
