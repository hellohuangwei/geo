import { AlertCircle, Sparkles } from 'lucide-react'
import { AgentMarkdown } from '@/components/AgentMarkdown'
import type { ChatMessage as ChatMessageType } from '@/types/douyinChat'

interface ChatMessageProps { message: ChatMessageType }

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { role, content, timestamp } = message

  if (role === 'user') return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[70%] rounded-[14px] rounded-br-[6px] bg-[var(--accent-soft)] px-4 py-3">
        <p className="text-[14px] leading-relaxed text-[var(--ink)] whitespace-pre-wrap break-words">{content}</p>
        <p className="mt-1 text-right text-[10px] text-[var(--ink-3)]">{formatTime(timestamp)}</p>
      </div>
    </div>
  )

  if (role === 'agent') return (
    <div className="flex items-start gap-3 mb-4">
      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent)] text-white shadow-[0_2px_6px_rgba(139,195,74,0.3)]">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="max-w-[85%] rounded-[14px] rounded-bl-[6px] bg-[var(--fill-tertiary)] px-4 py-3">
        <div className="agent-markdown text-[14px] leading-relaxed text-[var(--ink)]">
          <AgentMarkdown content={content} />
        </div>
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">{formatTime(timestamp)}</p>
      </div>
    </div>
  )

  if (role === 'error') return (
    <div className="flex items-start gap-3 mb-4">
      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[rgba(229,106,90,0.12)] text-[var(--red)]">
        <AlertCircle className="h-4 w-4" />
      </span>
      <div className="max-w-[75%] rounded-[14px] rounded-bl-[6px] bg-[rgba(229,106,90,0.06)] border border-[rgba(229,106,90,0.15)] px-4 py-3">
        <p className="text-[14px] leading-relaxed text-[var(--red)] whitespace-pre-wrap break-words">{content}</p>
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">{formatTime(timestamp)}</p>
      </div>
    </div>
  )

  if (role === 'system') {
    // Markdown 内容（评论表格等）用 AgentMarkdown 渲染，纯文本用简洁样式
    const isMarkdown = content.includes('|') || content.includes('###') || content.includes('```')
    if (isMarkdown) {
      return (
        <div className="mb-4 rounded-[14px] bg-[var(--fill-tertiary)] px-4 py-3">
          <AgentMarkdown className="agent-markdown text-[13px] leading-relaxed text-[var(--ink)]" content={content} />
        </div>
      )
    }
    return (
      <div className="flex justify-center mb-4">
        <span className="rounded-[8px] bg-[var(--fill-tertiary)] px-3 py-1 text-[11px] text-[var(--ink-2)]">{content}</span>
      </div>
    )
  }

  return null
}
