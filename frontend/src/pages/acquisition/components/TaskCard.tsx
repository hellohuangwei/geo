import { cn } from '@/lib/utils'
import type { DouyinTaskStatus } from '@/types/douyinLead'
import { formatTime } from './utils'

export function statusLabel(status: DouyinTaskStatus) {
  const labels: Record<DouyinTaskStatus, string> = {
    idle: '待启动',
    running: '运行中',
    analyzing: 'AI 分析中',
    paused: '已暂停',
    completed: '已完成',
    executor_required: '待连接执行器',
    failed: '失败',
  }
  return labels[status]
}

export function StatusBadge({ status }: { status: DouyinTaskStatus }) {
  const classes: Record<DouyinTaskStatus, string> = {
    idle: 'bg-[var(--fill-tertiary)] text-[var(--ink-2)]',
    running: 'bg-[rgba(111,168,56,0.12)] text-[var(--accent-d)]',
    analyzing: 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)]',
    paused: 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)]',
    completed: 'bg-[rgba(91,141,239,0.12)] text-[var(--blue)]',
    executor_required: 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)]',
    failed: 'bg-[rgba(229,106,90,0.12)] text-[var(--red)]',
  }
  return <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', classes[status])}>{statusLabel(status)}</span>
}

export function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-[var(--card)] px-2 py-2 text-center">
      <div className="num text-[14px] font-bold text-[var(--ink)]">{value}</div>
      <div className="text-[10px] text-[var(--ink-3)]">{label}</div>
    </div>
  )
}

import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import type { DouyinAcquisitionTask } from '@/types/douyinLead'

export function TaskCard({
  task, active, onSelect, onDelete,
}: {
  task: DouyinAcquisitionTask
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn(
      'rounded-[14px] border p-4 transition-colors',
      active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--fill-quaternary)]',
    )}>
      <button className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn('truncate text-[14px] font-semibold', active ? 'text-[var(--accent-d)]' : 'text-[var(--ink)]')}>
              {task.name}
            </div>
            <div className="mt-1 truncate text-[12px] text-[var(--ink-3)]">{task.config.keyword || '未配置关键词'}</div>
          </div>
          <StatusBadge status={task.status} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniStat label="视频" value={task.collectedVideoCount} />
          <MiniStat label="评论" value={task.analyzedCommentCount} />
          <MiniStat label="客户" value={task.leadCount} />
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
        <span className="text-[11px] text-[var(--ink-3)]">{formatTime(task.updatedAt)}</span>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
