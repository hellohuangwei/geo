import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/* ──────────── Pagination helpers ──────────── */

export interface PaginationMeta {
  total: number
  pages: number
  current: number
  start: number
  end: number
}

export interface Paginated<T> extends PaginationMeta {
  items: T[]
}

export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(page, 1), pages)
  const start = (current - 1) * pageSize
  const end = Math.min(start + pageSize, total)
  return { items: items.slice(start, end), total, pages, current, start, end }
}

/* ──────────── Formatting helpers ──────────── */

export function formatTime(value?: string) {
  if (!value) return '暂无时间'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function formatCommentTime(value?: string) {
  if (!value) return ''
  try {
    const date = new Date(value)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin} 分钟前`
    if (diffHour < 24) return `${diffHour} 小时前`
    if (diffDay < 7) return `${diffDay} 天前`
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  } catch {
    return ''
  }
}

/* ──────────── Avatar ──────────── */

export function Avatar({ text }: { text: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[12px] font-bold text-[var(--accent-d)]">
      {text.slice(0, 1).toUpperCase()}
    </span>
  )
}

/* ──────────── Section Title ──────────── */

export function SectionTitle({ icon, title, meta }: { icon: ReactNode; title: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent-d)]">
          {icon}
        </span>
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2>
      </div>
      {meta && <span className="text-[12px] font-semibold text-[var(--ink-3)]">{meta}</span>}
    </div>
  )
}
