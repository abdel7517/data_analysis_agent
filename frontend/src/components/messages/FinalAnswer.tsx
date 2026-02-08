import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent } from '@/components/ui/card'
import { MessageSquareText } from 'lucide-react'

interface FinalAnswerProps {
  content: string
  done?: boolean
}

const TYPING_SPEED = 10 // ms par caractère (~100 char/s)

function useTypingEffect(content: string, speed: number = TYPING_SPEED) {
  const [displayedContent, setDisplayedContent] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const indexRef = useRef(0)

  useEffect(() => {
    if (content.length <= indexRef.current) return

    setIsTyping(true)

    const typeNextChar = () => {
      if (indexRef.current < content.length) {
        setDisplayedContent(content.slice(0, indexRef.current + 1))
        indexRef.current++
        return setTimeout(typeNextChar, speed)
      } else {
        setIsTyping(false)
        return undefined
      }
    }

    const timeoutId = typeNextChar()
    return () => { if (timeoutId) clearTimeout(timeoutId) }
  }, [content, speed])

  return { displayedContent, isTyping }
}

export function FinalAnswer({ content, done = true }: FinalAnswerProps) {
  const { displayedContent, isTyping } = useTypingEffect(content)

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <div className="rounded-full bg-primary/10 p-1.5">
              <MessageSquareText className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-medium text-primary">Analyse</p>
              {(!done || isTyping) && (
                <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-full overflow-hidden text-sm leading-relaxed break-words [word-break:break-word] [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-all">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {isTyping ? displayedContent + '▌' : displayedContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
