import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { User } from 'lucide-react'

export function UserMessage({ content }) {
  return (
    <div className="flex gap-3 justify-end">
      <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap">
        {content}
      </div>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="bg-secondary text-secondary-foreground">
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    </div>
  )
}
