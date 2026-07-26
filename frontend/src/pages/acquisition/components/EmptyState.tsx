import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function EmptyState({ title, description, compact = false, icon }: { title: string; description: string; compact?: boolean; icon?: ReactNode }) {
  return (
    <div className={cn('rounded-[14px] border border-dashed border-[var(--line)] text-center', compact ? 'p-5' : 'p-10')}>
      {icon && (
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--fill-tertiary)] text-[var(--ink-3)]">
          {icon}
        </div>
      )}
      <div className="text-[14px] font-semibold text-[var(--ink)]">{title}</div>
      <p className="mx-auto mt-1 max-w-[420px] text-[12px] leading-relaxed text-[var(--ink-3)]">{description}</p>
    </div>
  )
}
