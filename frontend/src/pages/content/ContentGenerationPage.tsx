import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FilePlus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ContentCard } from '@/components/ContentCard'

const tasks = [
  { name: 'AI写作工具推荐文章', topic: 'AI工具', generated: 5, collected: 3, status: 'completed', created: '2026-07-05' },
  { name: 'CRM系统深度对比', topic: 'CRM', generated: 3, collected: 1, status: 'in_progress', created: '2026-07-06' },
  { name: '2025年SaaS趋势报告', topic: 'SaaS', generated: 0, collected: 12, status: 'collecting', created: '2026-07-07' },
  { name: '远程协作工具选购指南', topic: '远程办公', generated: 0, collected: 0, status: 'draft', created: '2026-07-08' },
]

const statusMap: Record<string, { label: string; className: string }> = {
  completed: { label: '已完成', className: 'bg-emerald-500/10 text-emerald-600' },
  in_progress: { label: '生成中', className: 'bg-blue-500/10 text-blue-600' },
  collecting: { label: '采集中', className: 'bg-amber-500/10 text-amber-600' },
  draft: { label: '草稿', className: 'bg-muted text-muted-foreground' },
}

export function ContentGenerationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="内容生成"
        description="管理和追踪AI内容生成任务"
        actions={
          <Button className="h-9 gap-1.5 text-sm font-bold rounded-[12px]"><FilePlus className="h-4 w-4" />新建任务</Button>
        }
      />

      <ContentCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30">
              <th className="py-3 pl-6 pr-4 text-xs font-bold text-muted-foreground">任务名称</th>
              <th className="py-3 pr-4 text-xs font-bold text-muted-foreground w-20">话题</th>
              <th className="py-3 pr-4 text-xs font-bold text-muted-foreground w-24">已生成数</th>
              <th className="py-3 pr-4 text-xs font-bold text-muted-foreground w-24">已采集数</th>
              <th className="py-3 pr-4 text-xs font-bold text-muted-foreground w-24">状态</th>
              <th className="py-3 pr-4 text-xs font-bold text-muted-foreground w-28">创建时间</th>
              <th className="py-3 pr-6 text-xs font-bold text-muted-foreground w-40">操作</th>
            </tr></thead>
            <tbody>
              {tasks.map((row, i) => {
                const st = statusMap[row.status]
                return (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 pl-6 pr-4 font-bold text-foreground">{row.name}</td>
                    <td className="py-3 pr-4"><Badge variant="secondary" className="text-xs font-semibold rounded-lg">{row.topic}</Badge></td>
                    <td className="py-3 pr-4 mono">{row.generated}</td>
                    <td className="py-3 pr-4 mono">{row.collected}</td>
                    <td className="py-3 pr-4"><Badge className={`text-xs font-semibold rounded-lg ${st.className}`}>{st.label}</Badge></td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.created}</td>
                    <td className="py-3 pr-6 flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold rounded-lg">继续对话</Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold rounded-lg">查看</Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold text-destructive rounded-lg">删除</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </div>
  )
}
