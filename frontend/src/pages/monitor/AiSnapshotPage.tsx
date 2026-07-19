import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, TrendingUp, FileSearch, ChevronLeft, ChevronRight, Clock, Globe, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

const snapshots = [
  { id: 1, platform: 'ChatGPT', question: '最好用的 CRM 系统是什么？', date: '2026-07-08', time: '14:30' },
  { id: 2, platform: 'DeepSeek', question: 'ERP 系统选型有哪些推荐？', date: '2026-07-08', time: '11:15' },
  { id: 3, platform: '豆包', question: 'AI 写作工具哪个好？', date: '2026-07-07', time: '16:00' },
  { id: 4, platform: '通义千问', question: '国内企业协作平台对比', date: '2026-07-07', time: '09:45' },
]

const platformColors: Record<string, string> = {
  'ChatGPT': 'var(--accent-d)',
  'DeepSeek': 'var(--blue)',
  '豆包': 'var(--teal)',
  '通义千问': 'var(--orange)',
}

export function AiSnapshotPage() {
  const [active, setActive] = useState(0)
  const snap = snapshots[active]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
      {/* Left — Snapshot Detail */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[var(--ink)] tracking-[-0.02em]">AI 快照</h1>
            <p className="text-[11.5px] text-[var(--ink-3)] mt-0.5">查看AI原始回答内容</p>
          </div>
          {/* Navigator */}
          <div className="flex items-center gap-1 bg-[var(--card)] rounded-[12px] border border-[var(--line)] p-1 shadow-[var(--shadow-card)]">
            <button onClick={() => setActive(Math.max(0, active - 1))} disabled={active === 0}
              className="h-8 w-8 rounded-[8px] flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)] disabled:opacity-30 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[12px] font-semibold px-2">{active + 1} / {snapshots.length}</span>
            <button onClick={() => setActive(Math.min(snapshots.length - 1, active + 1))} disabled={active === snapshots.length - 1}
              className="h-8 w-8 rounded-[8px] flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)] disabled:opacity-30 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Meta bar */}
        <div className="flex items-center gap-4 bg-[var(--card)] rounded-[20px] border border-[var(--line)] px-[22px] py-3.5 shadow-[var(--shadow-card)]">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-[8px] text-white"
            style={{ background: platformColors[snap.platform] || 'var(--accent)' }}>
            <Globe className="h-3 w-3" />{snap.platform}
          </span>
          <div className="text-[14px] font-semibold text-[var(--ink)] flex-1">{snap.question}</div>
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-3)]">
            <Clock className="h-3 w-3" />{snap.date} {snap.time}
          </span>
        </div>

        {/* Answer content */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="text-[11px] font-semibold text-[var(--ink-3)] mb-4">AI 原始回答</div>
          <div className="text-[14px] leading-[1.75] text-[var(--ink)]/85 space-y-3">
            <p>根据2025年的市场调研和用户反馈，以下是几款备受推荐的CRM系统：</p>
            <ol className="list-decimal pl-5 space-y-2.5">
              <li><strong className="text-[var(--ink)]">Salesforce</strong> — 全球领先的CRM平台，功能全面，适合大型企业。在Gartner魔力象限中连续多年位居领导者。</li>
              <li><strong className="text-[var(--ink)]">HubSpot</strong> — 免费版功能强大，适合中小企业和初创公司。拥有完善的入站营销工具集。</li>
              <li><strong className="text-[var(--ink)]">飞书CRM</strong> — 深度集成飞书生态，国内用户体验优秀，支持移动端全功能。</li>
              <li><strong className="text-[var(--ink)]">纷享销客</strong> — 国内市场份额领先，本地化服务好，在制造业和B2B领域有深厚积累。</li>
            </ol>
            <p>选择CRM系统时，建议根据企业规模、预算、行业特性和现有技术栈综合考虑。</p>
          </div>
        </div>

        {/* Brands + Sources */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
            <div className="text-[11px] font-semibold text-[var(--ink-3)] mb-3">提及品牌</div>
            <div className="flex gap-1.5 flex-wrap">
              {['Salesforce', 'HubSpot', '飞书', '纷享销客'].map(b => (
                <Badge key={b} variant="outline" className="text-[12px] font-semibold rounded-[8px]">{b}</Badge>
              ))}
            </div>
          </div>
          <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
            <div className="text-[11px] font-semibold text-[var(--ink-3)] mb-3">引用来源</div>
            <div className="flex gap-1.5 flex-wrap">
              {['Gartner 2025 CRM报告', '36氪SaaS行业分析'].map(s => (
                <button key={s} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] text-[11.5px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)] transition-colors border-0 bg-transparent cursor-pointer">
                  <ExternalLink className="h-3 w-3" />{s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[12px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)] transition-colors border-0 bg-transparent cursor-pointer">
            <FileSearch className="h-3.5 w-3.5" />查看引用详情
          </button>
          <button className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[12px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)] transition-colors border-0 bg-transparent cursor-pointer">
            <TrendingUp className="h-3.5 w-3.5" />查看趋势数据
          </button>
        </div>
      </div>

      {/* Right */}
      <div className="flex flex-col gap-4">
        {/* Quick actions */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <h3 className="text-[15px] font-semibold">快捷操作</h3>
          <div className="text-[11.5px] text-[var(--ink-3)] mb-4">快照工具</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <FileSearch className="w-4 h-4" />, label: '查看引用', color: 'var(--accent-d)' },
              { icon: <TrendingUp className="w-4 h-4" />, label: '趋势数据', color: 'var(--blue)' },
              { icon: <Download className="w-4 h-4" />, label: '导出快照', color: 'var(--purple)' },
              { icon: <ExternalLink className="w-4 h-4" />, label: '打开原文', color: 'var(--teal)' },
              { icon: <Globe className="w-4 h-4" />, label: '查看来源', color: 'var(--orange)' },
              { icon: <Clock className="w-4 h-4" />, label: '历史记录', color: 'var(--ink-2)' },
            ].map(a => (
              <div key={a.label} className="flex flex-col items-center gap-1.5 cursor-pointer group py-2">
                <div className="w-11 h-11 rounded-[12px] grid place-items-center group-hover:scale-105 transition-transform"
                  style={{ background: `${a.color}12` }}>
                  <span style={{ color: a.color }}>{a.icon}</span>
                </div>
                <span className="text-[10.5px] text-[var(--ink-2)] group-hover:text-[var(--ink)] transition-colors">{a.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Platform avatars */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold">AI 平台</h3>
            <span className="text-[var(--ink-3)] cursor-pointer text-[18px] leading-none">⋮</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['ChatGPT','DeepSeek','豆包','千问','Kimi','百度AI'].map((name, i) => {
              const colors = ['var(--accent-d)','var(--blue)','var(--teal)','var(--orange)','var(--purple)','var(--red)']
              return (
                <div key={name} className="flex flex-col items-center gap-1">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${colors[i]}, ${colors[i]}dd)` }}>
                    {name.charAt(0)}
                  </div>
                  <span className="text-[9.5px] text-[var(--ink-3)]">{name}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Snapshot List */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-[22px] py-4 border-b border-[var(--line)]">
            <h3 className="text-[15px] font-semibold">快照列表</h3>
            <div className="text-[11.5px] text-[var(--ink-3)]">最近采集</div>
          </div>
          {snapshots.map((s, i) => (
            <button key={s.id} onClick={() => setActive(i)}
              className={cn(
                'w-full text-left px-[22px] py-3.5 border-b border-[var(--line-2)] last:border-0 transition-colors flex items-start gap-3 cursor-pointer',
                i === active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--fill-quaternary)]'
              )}>
              <span className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: platformColors[s.platform] || 'var(--accent)' }}>
                {s.platform.charAt(0)}
              </span>
              <div className="flex-1 min-w-0">
                <div className={cn('text-[13px] font-semibold', i === active ? 'text-[var(--accent-d)]' : 'text-[var(--ink)]')}>{s.question}</div>
                <div className="text-[10.5px] text-[var(--ink-3)] mt-0.5">{s.date} · {s.platform}</div>
              </div>
              {i === active && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
