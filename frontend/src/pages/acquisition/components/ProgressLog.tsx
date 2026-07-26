import { useEffect, useRef, useState } from 'react'
import { Loader2, ChevronDown, ChevronRight, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProgressEntry } from '@/stores/douyinChatStore'

const levelColors: Record<ProgressEntry['level'], string> = {
  info:    'text-[var(--ink-2)]',
  success: 'text-[var(--accent-d)]',
  warn:    'text-[var(--orange)]',
  error:   'text-[var(--red)]',
}

const levelDots: Record<ProgressEntry['level'], string> = {
  info:    'bg-[var(--ink-3)]',
  success: 'bg-[var(--accent)]',
  warn:    'bg-[var(--orange)]',
  error:   'bg-[var(--red)]',
}

interface ProgressLogProps {
  messages: ProgressEntry[]
  /** 是否正在处理中（决定 loading 指示器和自动展开行为） */
  isActive: boolean
}

export function ProgressLog({ messages, isActive }: ProgressLogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(!isActive)

  // 新消息到达时自动滚动到底部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  // 任务激活时自动展开
  useEffect(() => {
    if (isActive && messages.length > 0) {
      setCollapsed(false)
    }
  }, [isActive, messages.length])

  if (messages.length === 0 && !isActive) return null

  return (
    <div className="mb-4 ml-11 max-w-[75%]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'flex w-full items-center gap-2 rounded-t-[12px] px-4 py-2.5',
          'bg-[var(--fill-tertiary)] border border-[var(--line)]',
          collapsed && 'rounded-b-[12px]',
          'hover:bg-[var(--fill-secondary)] transition-colors',
        )}
      >
        {isActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)] shrink-0" />
        ) : (
          <Terminal className="h-3.5 w-3.5 text-[var(--ink-2)] shrink-0" />
        )}
        <span className="text-[12px] font-semibold text-[var(--ink)]">
          {isActive ? '智能体处理中...' : `处理日志 (${messages.length} 条)`}
        </span>
        <span className="flex-1" />
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-3)] shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)] shrink-0" />
        )}
      </button>

      {/* Log body */}
      {!collapsed && (
        <div
          ref={containerRef}
          className={cn(
            'max-h-[280px] overflow-y-auto rounded-b-[12px] border border-t-0 border-[var(--line)]',
            'bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.02)]',
            'px-4 py-3 font-mono',
          )}
        >
          {messages.length === 0 && isActive ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-[var(--ink-3)]" />
              <span className="text-[11px] text-[var(--ink-3)]">等待智能体响应...</span>
            </div>
          ) : (
            messages.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 py-[3px]"
              >
                <span className={cn('mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full', levelDots[entry.level])} />
                <span className={cn('text-[11px] leading-[1.6] break-all', levelColors[entry.level])}>
                  {entry.text}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
