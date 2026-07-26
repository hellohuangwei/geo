import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginationMeta } from './utils'

export function PaginationBar({
  page, onPageChange, itemLabel, className,
}: {
  page: PaginationMeta
  onPageChange: (page: number) => void
  itemLabel: string
  className?: string
}) {
  if (page.total === 0) return null

  return (
    <div className={cn('flex flex-col gap-3 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <p className="text-[12px] text-[var(--ink-3)]">
        第 {page.start + 1}-{page.end} 条，共 {page.total} 条{itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onPageChange(page.current - 1)} disabled={page.current <= 1}>
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <span className="num min-w-16 text-center text-[12px] font-semibold text-[var(--ink-2)]">
          {page.current} / {page.pages}
        </span>
        <Button size="sm" variant="outline" onClick={() => onPageChange(page.current + 1)} disabled={page.current >= page.pages}>
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function TaskListPager({ page, onPageChange }: { page: PaginationMeta; onPageChange: (page: number) => void }) {
  if (page.total === 0) return null

  const nextPage = page.current >= page.pages ? 1 : page.current + 1
  return (
    <button type="button" onClick={() => onPageChange(nextPage)}
      className="mt-4 flex h-10 w-full items-center justify-center gap-1 text-[13px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)]">
      查看全部任务
      <ChevronRight className="h-4 w-4" />
    </button>
  )
}
