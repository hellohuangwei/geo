import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContentCard } from '@/components/ContentCard'
import { Loader2, Pause, Play } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import type { DouyinAcquisitionConfig, DouyinAcquisitionTask } from '@/types/douyinLead'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-semibold text-[var(--ink-2)]">{label}</span>
      {children}
    </label>
  )
}

const FALLBACK_INDUSTRIES = [
  { value: 'education', label: '教育' },
  { value: 'finance', label: '金融' },
  { value: 'healthcare', label: '医疗健康' },
  { value: 'ecommerce', label: '电商' },
  { value: 'realestate', label: '房地产' },
  { value: 'automotive', label: '汽车' },
  { value: 'catering', label: '餐饮' },
  { value: 'travel', label: '旅游' },
  { value: 'beauty', label: '美妆' },
  { value: 'momBaby', label: '母婴' },
  { value: 'home', label: '家居' },
  { value: 'other', label: '其他' },
]

export function IndustryField({ value, brandIndustry, onChange }: { value: string; brandIndustry: string; onChange: (value: string) => void }) {
  const options = useMemo(() => {
    const list: Array<{ value: string; label: string }> = []
    if (brandIndustry) {
      list.push({ value: brandIndustry, label: `🏷 ${brandIndustry}（品牌）` })
    }
    for (const item of FALLBACK_INDUSTRIES) {
      if (item.value !== brandIndustry && item.label !== brandIndustry) {
        list.push(item)
      }
    }
    return list
  }, [brandIndustry])

  return (
    <Field label="行业">
      <Select value={value || '__all__'} onValueChange={(nextValue) => onChange(nextValue === '__all__' ? '' : nextValue)}>
        <SelectTrigger>
          <SelectValue placeholder="选择行业（可选）" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">不限</SelectItem>
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

import type { DouyinIntentLevel } from '@/types/douyinLead'

const autoLeadLevels: Array<{ value: Exclude<DouyinIntentLevel, 'none'>; label: string }> = [
  { value: 'high', label: '高意向' },
  { value: 'medium', label: '中意向' },
  { value: 'low', label: '低意向' },
]

export function ControlPanel({
  config, selectedTask, submitting, collectedCount, brandIndustry, onConfigChange, onStart, onPause,
}: {
  config: DouyinAcquisitionConfig
  selectedTask: DouyinAcquisitionTask | null
  submitting: boolean
  collectedCount: number
  brandIndustry: string
  onConfigChange: <K extends keyof DouyinAcquisitionConfig>(key: K, value: DouyinAcquisitionConfig[K]) => void
  onStart: () => Promise<void>
  onPause: () => Promise<void>
}) {
  const canPause = selectedTask?.status === 'running' || selectedTask?.status === 'analyzing' || selectedTask?.status === 'executor_required'

  return (
    <ContentCard padding="normal" className="min-h-[556px]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[16px] font-bold text-[var(--ink)]">采集设置</h2>
      </div>

      <div className="mt-5 flex min-h-[462px] flex-col">
        <div className="space-y-4">
          <Field label="搜索关键词">
            <Input value={config.keyword} onChange={(event) => onConfigChange('keyword', event.target.value)} placeholder="输入本次要采集的关键词" />
          </Field>
          <p className="text-[12px] leading-relaxed text-[var(--ink-3)]">
            每次任务只搜索一个关键词，系统会自动遍历该关键词下的视频并评论。
          </p>

          <IndustryField value={config.industry} brandIndustry={brandIndustry} onChange={(value) => onConfigChange('industry', value)} />

          <div>
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[var(--ink-2)]">目标评论数</span>
              <span className="num text-[var(--ink-3)]">{collectedCount} / {config.targetCommentCount}</span>
            </div>
            <Input type="number" min={1} value={config.targetCommentCount} onChange={(event) => onConfigChange('targetCommentCount', Math.max(1, Number(event.target.value)))} />
          </div>

          <div>
            <div className="mb-2 text-[12px] font-semibold text-[var(--ink-2)]">自动加入客户库</div>
            <div className="flex flex-wrap gap-2">
              {autoLeadLevels.map((item) => {
                const active = config.autoAddLeadLevels.includes(item.value)
                return (
                  <button key={item.value} type="button" onClick={() => {
                    onConfigChange('autoAddLeadLevels', active
                      ? config.autoAddLeadLevels.filter((level) => level !== item.value)
                      : [...config.autoAddLeadLevels, item.value])
                  }}
                    className={cn('h-8 rounded-[9px] px-3 text-[12px] font-semibold transition-colors active:scale-[0.97]',
                      active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--fill-tertiary)] text-[var(--ink-2)]')}>
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-3 pt-8">
          <Button variant="outline" onClick={onPause} disabled={!canPause} className="gap-2">
            <Pause className="h-4 w-4" />
            暂停任务
          </Button>
          <Button onClick={onStart} disabled={submitting} className="gap-2 shadow-[0_3px_10px_rgba(139,195,74,0.16)]">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            重新开始
          </Button>
        </div>
      </div>
    </ContentCard>
  )
}
