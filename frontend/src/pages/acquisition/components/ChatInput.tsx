import { useState, type KeyboardEvent } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SUGGESTIONS = [
  '帮我采集100条小龙虾的评论',
  '采集200条火锅相关的评论',
  '帮我找50条美妆产品的用户反馈',
]

interface ChatInputProps { onSend: (text: string) => void; disabled?: boolean }

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="border-t border-[var(--line)] bg-[var(--card)] px-4 py-3">
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        <span className="text-[11px] text-[var(--ink-3)] leading-7 shrink-0">试试:</span>
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => onSend(s)} disabled={disabled}
            className="rounded-[8px] border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--ink-2)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-d)] transition-colors">
            {s}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2.5">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          placeholder="输入采集需求..."
          className={cn(
            'flex-1 resize-none rounded-[12px] border border-[var(--line)] bg-[var(--fill-tertiary)] px-4 py-2.5',
            'text-[14px] leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-3)]',
            'outline-none focus:border-[var(--accent)] transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        />
        <button type="button" onClick={handleSend} disabled={disabled || !value.trim()}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]',
            'bg-[var(--accent)] text-white shadow-[0_3px_10px_rgba(139,195,74,0.25)]',
            'hover:bg-[var(--accent-d)] active:scale-[0.96] transition-all',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
          )}>
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--ink-3)] text-center">Enter 发送 · Shift + Enter 换行</p>
    </div>
  )
}
