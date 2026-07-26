import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Clock3, ExternalLink, EyeOff, MessageCircle, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DouyinImportedComment, DouyinIntentLevel } from '@/types/douyinLead'
import { formatCommentTime } from './utils'
import { Avatar } from './utils'

export function IntentBadge({ level }: { level: DouyinIntentLevel }) {
  const map: Record<DouyinIntentLevel, { label: string; className: string; icon: ReactNode }> = {
    high: { label: '高意向', className: 'bg-[rgba(111,168,56,0.12)] text-[var(--accent-d)] border-transparent', icon: <CheckCircle2 className="h-3 w-3" /> },
    medium: { label: '中意向', className: 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)] border-transparent', icon: <Clock3 className="h-3 w-3" /> },
    low: { label: '低意向', className: 'bg-[rgba(91,141,239,0.12)] text-[var(--blue)] border-transparent', icon: <MessageCircle className="h-3 w-3" /> },
    none: { label: '无明显意向', className: 'bg-[var(--fill-tertiary)] text-[var(--ink-3)] border-transparent', icon: <EyeOff className="h-3 w-3" /> },
  }
  const item = map[level]
  return <Badge variant="outline" className={cn('gap-1', item.className)}>{item.icon}{item.label}</Badge>
}

export function CommentRow({
  comment, onAddLead, onIgnore,
}: {
  comment: DouyinImportedComment
  onAddLead: () => void
  onIgnore: () => void
}) {
  const publishedText = formatCommentTime(comment.publishedAt)

  return (
    <div className="py-4 first:pt-1">
      <div className="flex items-start gap-2.5">
        <Avatar text={comment.nickname} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--ink)]">{comment.nickname}</span>
            <span className="text-[11px] text-[var(--ink-3)]">@{comment.douyinId || '未知账号'}</span>
            <IntentBadge level={comment.analysis.level} />
            <span className="num text-[12px] font-semibold text-[var(--ink-2)]">{comment.analysis.score}/100</span>
            {publishedText && (
              <span className="text-[11px] text-[var(--ink-3)]">{publishedText}</span>
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink)]">{comment.content}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-[var(--line)] text-[var(--ink-2)]">关键词：{comment.keyword}</Badge>
            <Badge variant="secondary">赞 {comment.likes}</Badge>
            <Badge variant="secondary">回复 {comment.replyCount}</Badge>
            {comment.videoUrl && (
              <a href={comment.videoUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--accent-d)] noopener hover:bg-[var(--accent-soft)]">
                作品链接 <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {comment.analysis.demandKeywords.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
          </div>
          {comment.analysis.reason && (
            <p className="mt-2.5 rounded-[9px] bg-[var(--fill-tertiary)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
              AI 判断：{comment.analysis.reason}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onIgnore}>
          <EyeOff className="h-4 w-4" />
          忽略
        </Button>
        <Button size="sm" onClick={onAddLead} disabled={comment.isLead}>
          <UserPlus className="h-4 w-4" />
          {comment.isLead ? '已加入' : '加入客户库'}
        </Button>
      </div>
    </div>
  )
}
