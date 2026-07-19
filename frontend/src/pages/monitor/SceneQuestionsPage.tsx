import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Search, MessageSquare, TrendingUp, ArrowUpRight, Download, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const questions = [
  { date: '2026-07-08', question: '最好用的 CRM 系统是什么？', topic: 'CRM', platform: 'ChatGPT', status: 'online', volume: 1280 },
  { date: '2026-07-08', question: 'ERP 系统选型有哪些推荐？', topic: 'ERP', platform: 'DeepSeek', status: 'online', volume: 960 },
  { date: '2026-07-07', question: 'AI 写作工具哪个好？', topic: 'AI工具', platform: '豆包', status: 'online', volume: 840 },
  { date: '2026-07-07', question: '国内企业协作平台对比', topic: 'SaaS', platform: '通义千问', status: 'offline', volume: 620 },
  { date: '2026-07-06', question: '2025年项目管理软件排行榜', topic: '项目管理', platform: 'Kimi', status: 'online', volume: 510 },
  { date: '2026-07-06', question: '飞书和钉钉哪个更适合中小企业？', topic: 'SaaS', platform: 'ChatGPT', status: 'online', volume: 480 },
  { date: '2026-07-05', question: '如何选择知识管理工具？', topic: '知识管理', platform: '百度AI', status: 'offline', volume: 390 },
  { date: '2026-07-05', question: '最好的数据库管理工具有哪些？', topic: '数据库', platform: '元宝', status: 'online', volume: 320 },
]

const platformChips = ['全部', 'ChatGPT', 'DeepSeek', '豆包', '通义千问', 'Kimi']

export function SceneQuestionsPage() {
  const [search, setSearch] = useState('')
  const [activePlatform, setActivePlatform] = useState('全部')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all')

  const filtered = questions.filter(q => {
    if (search && !q.question.includes(search)) return false
    if (activePlatform !== '全部' && q.platform !== activePlatform) return false
    if (statusFilter !== 'all' && q.status !== statusFilter) return false
    return true
  })

  const onlineCount = questions.filter(q => q.status === 'online').length
  const totalVolume = questions.reduce((s, q) => s + q.volume, 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Left */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[var(--ink)] tracking-[-0.02em]">竞品分析</h1>
            <p className="text-[11.5px] text-[var(--ink-3)] mt-0.5">监测竞品在 AI 平台中的品牌提及，分析市场覆盖与排名</p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '监控问题总数', value: questions.length.toString(), sub: '个场景' },
            { label: '在线问题', value: onlineCount.toString(), sub: `${Math.round(onlineCount / questions.length * 100)}% 在线率`, accent: true },
            { label: '查询总量', value: (totalVolume / 1000).toFixed(1) + 'k', sub: '次/月' },
          ].map(s => (
            <div key={s.label} className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-4 shadow-[var(--shadow-card)]">
              <div className="text-[11px] font-semibold text-[var(--ink-3)] ">{s.label}</div>
              <div className={cn('text-[26px] font-extrabold mt-1 leading-none tracking-[-0.03em] num', s.accent && 'text-[var(--accent-d)]')}>{s.value}</div>
              <div className="text-[11px] text-[var(--ink-3)] mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-[22px] py-3 border-b border-[var(--line)]">
            <div className="flex items-center gap-2 bg-[var(--bg)] rounded-[10px] px-3 py-1.5 flex-1">
              <Search className="w-3.5 h-3.5 text-[var(--ink-3)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索问题..."
                className="bg-transparent border-none outline-none text-[13px] text-[var(--ink)] w-full placeholder:text-[var(--ink-3)]" />
            </div>
            <div className="flex gap-1">
              {platformChips.map(p => (
                <button key={p} onClick={() => setActivePlatform(p)} className={cn(
                  'h-7 px-2.5 rounded-[8px] text-[11px] font-semibold transition-all',
                  p === activePlatform ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-2)] hover:bg-[var(--fill-tertiary)]'
                )}>{p}</button>
              ))}
            </div>
            <div className="flex ml-auto bg-[var(--bg)] rounded-[8px] p-1">
              {(['all', 'online', 'offline'] as const).map(f => (
                <button key={f} onClick={() => setStatusFilter(f)} className={cn(
                  'h-[26px] px-3 rounded-[6px] text-[11px] font-semibold transition-all',
                  statusFilter === f ? 'bg-[var(--card)] text-[var(--ink)] shadow-[var(--shadow-xs)]' : 'text-[var(--ink-3)]'
                )}>{f === 'all' ? '全部' : f === 'online' ? '在线' : '离线'}</button>
              ))}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--line)] text-left">
                <th className="py-3 pl-[22px] pr-4 text-[10px] font-semibold text-[var(--ink-3)]  w-28">日期</th>
                <th className="py-3 pr-4 text-[10px] font-semibold text-[var(--ink-3)] ">问题</th>
                <th className="py-3 pr-4 text-[10px] font-semibold text-[var(--ink-3)]  w-20">话题</th>
                <th className="py-3 pr-4 text-[10px] font-semibold text-[var(--ink-3)]  w-24">AI 平台</th>
                <th className="py-3 pr-4 text-[10px] font-semibold text-[var(--ink-3)]  w-16">状态</th>
                <th className="py-3 pr-[22px] text-[10px] font-semibold text-[var(--ink-3)]  w-20 text-right">查询量</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} className="border-b border-[var(--line-2)] last:border-0 hover:bg-[var(--fill-quaternary)] transition-colors">
                  <td className="py-3 pl-[22px] pr-4 text-[12px] text-[var(--ink-2)] num">{row.date}</td>
                  <td className="py-3 pr-4 text-[14px] font-semibold text-[var(--ink)]">{row.question}</td>
                  <td className="py-3 pr-4"><Badge variant="secondary" className="text-[11px] font-semibold rounded-full">{row.topic}</Badge></td>
                  <td className="py-3 pr-4 text-[12px] text-[var(--ink-2)] font-medium">{row.platform}</td>
                  <td className="py-3 pr-4">
                    <span className={cn('inline-flex items-center gap-1.5 text-[11.5px] font-semibold',
                      row.status === 'online' ? 'text-[var(--accent-d)]' : 'text-[var(--ink-3)]')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', row.status === 'online' ? 'bg-[var(--accent)]' : 'bg-[var(--ink-3)]')} />
                      {row.status === 'online' ? '在线' : '离线'}
                    </span>
                  </td>
                  <td className="py-3 pr-[22px] text-[13px] font-semibold text-[var(--ink)] text-right num">{row.volume.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right */}
      <div className="flex flex-col gap-4">
        {/* Topic distribution */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] grid place-items-center">
              <MessageSquare className="w-4 h-4 text-[var(--accent-d)]" strokeWidth={1.7} />
            </div>
            <h3 className="text-[15px] font-semibold">热门话题</h3>
          </div>
          {[
            { topic: 'SaaS', count: 42, pct: 28 },
            { topic: 'AI工具', count: 35, pct: 23 },
            { topic: 'CRM', count: 28, pct: 19 },
            { topic: '项目管理', count: 22, pct: 15 },
            { topic: 'ERP', count: 15, pct: 10 },
            { topic: '知识管理', count: 8, pct: 5 },
          ].map((t, i) => (
            <div key={t.topic} className="flex items-center gap-3 py-2.5 border-b border-[var(--line-2)] last:border-0">
              <span className={cn('w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[10px] font-bold shrink-0',
                i === 0 ? 'bg-[var(--accent)] text-white' : 'bg-[var(--fill-tertiary)] text-[var(--ink-2)]')}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[12.5px]"><b className="font-semibold">{t.topic}</b><span className="num text-[var(--ink-2)]">{t.count}</span></div>
                <div className="h-[4px] rounded-[2px] bg-[var(--bg)] mt-1 overflow-hidden">
                  <div className="h-full rounded-[2px]" style={{ width: `${t.pct}%`, background: i === 0 ? 'var(--accent)' : 'var(--fill-primary)' }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <h3 className="text-[15px] font-semibold">快捷操作</h3>
          <div className="text-[11.5px] text-[var(--ink-3)] mb-4">问题管理工具</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <Search className="w-4 h-4" />, label: '搜索问题', color: 'var(--accent-d)' },
              { icon: <Download className="w-4 h-4" />, label: '导出列表', color: 'var(--blue)' },
              { icon: <TrendingUp className="w-4 h-4" />, label: '趋势分析', color: 'var(--purple)' },
              { icon: <MessageSquare className="w-4 h-4" />, label: '新建问题', color: 'var(--teal)' },
              { icon: <ArrowUpRight className="w-4 h-4" />, label: '生成内容', color: 'var(--orange)' },
              { icon: <ExternalLink className="w-4 h-4" />, label: '查看快照', color: 'var(--ink-2)' },
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

        {/* AI Platform avatars */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold">AI 平台</h3>
            <span className="text-[var(--ink-3)] cursor-pointer text-[18px] leading-none">⋮</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { name: 'ChatGPT', color: 'var(--accent-d)', count: 2_840 },
              { name: 'DeepSeek', color: 'var(--blue)', count: 2_150 },
              { name: '豆包', color: 'var(--teal)', count: 1_920 },
              { name: '千问', color: 'var(--orange)', count: 1_460 },
              { name: 'Kimi', color: 'var(--purple)', count: 1_280 },
              { name: '百度AI', color: 'var(--red)', count: 890 },
            ].map(p => (
              <div key={p.name} className="flex flex-col items-center gap-1">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}dd)` }}>
                  {p.name.charAt(0)}
                </div>
                <span className="text-[9.5px] text-[var(--ink-3)]">{p.name}</span>
              </div>
            ))}
          </div>
          {/* Mini bars */}
          <div className="mt-4 space-y-2">
            {[
              { name: 'ChatGPT', pct: 30, color: 'var(--accent-d)' },
              { name: 'DeepSeek', pct: 23, color: 'var(--blue)' },
              { name: '豆包', pct: 20, color: 'var(--teal)' },
              { name: '千问', pct: 15, color: 'var(--orange)' },
              { name: 'Kimi', pct: 12, color: 'var(--purple)' },
            ].map(p => (
              <div key={p.name} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--ink-2)] w-14 shrink-0">{p.name}</span>
                <div className="h-[5px] rounded-[3px] bg-[var(--bg)] flex-1 overflow-hidden">
                  <div className="h-full rounded-[3px]" style={{ width: `${p.pct}%`, background: p.color }} />
                </div>
                <span className="text-[10px] font-semibold text-[var(--ink-2)] num w-8 text-right">{p.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick insight */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-d))' }}>
              <TrendingUp className="w-4 h-4 text-white" strokeWidth={1.7} />
            </div>
            <h3 className="text-[15px] font-semibold">场景洞察</h3>
          </div>
          <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed mt-2">
            SaaS 和 AI工具是最热门话题，占比超50%。ChatGPT 提问量最大，国产平台增长迅速。
          </p>
        </div>
      </div>
    </div>
  )
}
