import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContentCard } from '@/components/ContentCard'
import { ExternalLink, Send, Users } from 'lucide-react'
import type { DouyinLead, DouyinLeadStatus } from '@/types/douyinLead'
import { Avatar, SectionTitle } from './utils'
import { IntentBadge } from './CommentRow'
import { EmptyState } from './EmptyState'

const leadStatusOptions: Array<{ value: DouyinLeadStatus; label: string }> = [
  { value: 'new', label: '新客户' },
  { value: 'pending', label: '待跟进' },
  { value: 'contacted', label: '已触达' },
  { value: 'communicating', label: '沟通中' },
  { value: 'converted', label: '已转化' },
  { value: 'invalid', label: '无效' },
]

function LeadCard({
  lead, selected, onToggleSelect, onStatusChange, onNoteBlur,
}: {
  lead: DouyinLead
  selected: boolean
  onToggleSelect: () => void
  onStatusChange: (status: DouyinLeadStatus) => void
  onNoteBlur: (note: string) => void
}) {
  const [note, setNote] = useState(lead.note)

  useEffect(() => { setNote(lead.note) }, [lead.note])

  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--fill-quaternary)] p-4">
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggleSelect}
          className="mt-1.5 h-4 w-4 shrink-0 rounded-[4px] accent-[var(--accent)] cursor-pointer" />
        <Avatar text={lead.nickname} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[var(--ink)]">{lead.nickname}</div>
              <div className="truncate text-[11px] text-[var(--ink-3)]">@{lead.douyinId || '未知账号'}</div>
            </div>
            <IntentBadge level={lead.level} />
          </div>

          <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[var(--ink-2)]">{lead.content}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-[var(--line)] text-[var(--ink-2)]">关键词：{lead.keyword || '未标记'}</Badge>
            <Badge variant="secondary">{lead.score}/100</Badge>
            {lead.sourceVideoUrl && (
              <a href={lead.sourceVideoUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--accent-d)] hover:bg-[var(--accent-soft)]">
                来源作品 <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {lead.demandKeywords.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
          </div>

          <Select value={lead.status} onValueChange={(value) => onStatusChange(value as DouyinLeadStatus)}>
            <SelectTrigger className="mt-3 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {leadStatusOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <textarea value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => onNoteBlur(note)}
            rows={3} className="mt-3 w-full resize-none rounded-[10px] border border-[var(--line)] bg-transparent px-3 py-2 text-[12px] outline-none focus:border-[var(--accent)]"
            placeholder="添加跟进备注" />
        </div>
      </div>
    </div>
  )
}

export function LeadLibrary({
  leads, selectedIds, onToggleSelect, onToggleSelectAll, onBatchSend, onStatusChange, onNoteBlur,
}: {
  leads: DouyinLead[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onBatchSend: () => void
  onStatusChange: (lead: DouyinLead, status: DouyinLeadStatus) => void
  onNoteBlur: (lead: DouyinLead, note: string) => void
}) {
  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.includes(l.id))

  return (
    <ContentCard padding="normal">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle icon={<Users className="h-4 w-4" />} title="潜在客户库" meta={`${leads.length} 人`} />
        <div className="flex items-center gap-2">
          {leads.length > 0 && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--ink-2)] select-none">
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll}
                className="h-3.5 w-3.5 rounded-[3px] accent-[var(--accent)]" />
              全选
            </label>
          )}
          {selectedIds.length > 0 && (
            <Button size="sm" onClick={onBatchSend} className="h-7 gap-1 rounded-[8px] text-[11px]">
              <Send className="h-3 w-3" />
              批量发私信 ({selectedIds.length})
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {leads.length === 0 ? (
          <EmptyState title="暂无目标客户" description="从评论列表点击「加入客户库」即可将用户添加到这里。" compact />
        ) : leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} selected={selectedIds.includes(lead.id)}
            onToggleSelect={() => onToggleSelect(lead.id)} onStatusChange={(status) => onStatusChange(lead, status)}
            onNoteBlur={(note) => onNoteBlur(lead, note)} />
        ))}
      </div>
    </ContentCard>
  )
}
