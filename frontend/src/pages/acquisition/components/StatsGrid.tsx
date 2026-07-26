import { cn } from '@/lib/utils'
import { ContentCard } from '@/components/ContentCard'
import { BarChart3, Database, MessageCircle, Play, Users } from 'lucide-react'
import type { ReactNode } from 'react'

function StatItem({ icon, label, value }: { icon: ReactNode; label: string; value: number; primary?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--fill-tertiary)] text-[var(--ink-3)]')}>
        {icon}
      </span>
      <div>
        <div className="num text-[18px] font-bold leading-none text-[var(--ink)]">{value}</div>
        <div className="mt-0.5 text-[11px] font-medium text-[var(--ink-3)]">{label}</div>
      </div>
    </div>
  )
}

export function StatsGrid({ stats }: { stats: Record<'tasks' | 'running' | 'comments' | 'leads' | 'highLeads', number> }) {
  const cards = [
    { icon: <Database className="h-6 w-6" />, label: '获客任务', value: stats.tasks, hint: '全部任务', tone: 'green' },
    { icon: <Play className="h-6 w-6" />, label: '运行中', value: stats.running, hint: '进行中任务', tone: 'green' },
    { icon: <MessageCircle className="h-6 w-6" />, label: '已分析评论', value: stats.comments, hint: '今日新增', tone: 'orange' },
    { icon: <Users className="h-6 w-6" />, label: '潜在客户', value: stats.leads, hint: '待跟进客户', tone: 'blue' },
    { icon: <BarChart3 className="h-6 w-6" />, label: '高意向客户', value: stats.highLeads, hint: '重点客户', tone: 'purple' },
  ]

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <ContentCard key={card.label} padding="normal" className="min-h-[126px]">
          <div className="flex items-start gap-4">
            <span className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]',
              card.tone === 'green' && 'bg-[rgba(139,195,74,0.14)] text-[var(--accent-d)]',
              card.tone === 'orange' && 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)]',
              card.tone === 'blue' && 'bg-[rgba(91,141,239,0.13)] text-[var(--blue)]',
              card.tone === 'purple' && 'bg-[rgba(156,91,239,0.12)] text-[#8a3fd1]',
            )}>
              {card.icon}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-[var(--ink-2)]">{card.label}</div>
              <div className="num mt-2 text-[26px] font-bold leading-none text-[var(--ink)]">{card.value}</div>
              <div className="mt-3 text-[11px] text-[var(--ink-3)]">{card.hint}</div>
            </div>
          </div>
        </ContentCard>
      ))}
    </div>
  )
}
