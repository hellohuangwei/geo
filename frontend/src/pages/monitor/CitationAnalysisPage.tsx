import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExternalLink, Download, Filter, Link2, TrendingUp, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

const citations = [
  { title: '2025年企业协同办公工具选型指南', site: '36氪', count: 1286, articles: 89, trend: 'up' },
  { title: 'AI时代下的生产力工具推荐', site: '少数派', count: 952, articles: 67, trend: 'up' },
  { title: '远程办公最值得入手的10款SaaS', site: '知乎', count: 847, articles: 54, trend: 'down' },
  { title: '企业数字化转型必读白皮书', site: 'InfoQ', count: 723, articles: 42, trend: 'up' },
  { title: '国内外主流ERP系统对比评测', site: 'CSDN', count: 688, articles: 38, trend: 'same' },
  { title: '2025年最佳项目管理工具排行', site: '掘金', count: 612, articles: 35, trend: 'up' },
  { title: 'AI原生应用开发实践与思考', site: 'SegmentFault', count: 534, articles: 29, trend: 'up' },
]

/* 迷你柱状条 */
function MiniBar({ count, max }: { count: number; max: number }) {
  return (
    <div className="h-1.5 rounded-full bg-[var(--bg)] w-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${(count / max) * 100}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-d))' }} />
    </div>
  )
}

export function CitationAnalysisPage() {
  const [filterBrand, setFilterBrand] = useState(false)
  const maxCount = Math.max(...citations.map(c => c.count))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* ===== Left Column ===== */}
      <div className="flex flex-col gap-4">
        {/* Header + Stats */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[var(--ink)] tracking-[-0.02em]">引用分析</h1>
            <p className="text-[11.5px] text-[var(--ink-3)] mt-0.5">分析AI平台最常引用的文章来源</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-[13px] rounded-[10px]"><Link2 className="h-3.5 w-3.5" />复制链接</Button>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-[13px] rounded-[10px]"><Download className="h-3.5 w-3.5" />导出</Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '引用文章总数', value: '1,286', sub: '篇' },
            { label: '覆盖站点', value: '47', sub: '个平台' },
            { label: '月增长', value: '+12.5%', sub: '较上月', accent: true },
          ].map(s => (
            <div key={s.label} className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-4 shadow-[var(--shadow-card)]">
              <div className="text-[11px] font-semibold text-[var(--ink-3)]">{s.label}</div>
              <div className={cn('text-[26px] font-extrabold mt-1 leading-none tracking-[-0.03em] num', s.accent ? 'text-[var(--accent-d)]' : 'text-[var(--ink)]')}>{s.value}</div>
              <div className="text-[11px] text-[var(--ink-3)] mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-[22px] py-3 border-b border-[var(--line)]">
            <Input placeholder="搜索文章标题..." className="h-9 w-56 text-[13px] rounded-[12px] bg-[var(--bg)] border-[var(--line)]" />
            <button onClick={() => setFilterBrand(!filterBrand)}
              className={cn('h-9 px-3 rounded-[10px] text-[12px] font-semibold transition-all inline-flex items-center gap-1.5',
                filterBrand ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)]')}>
              <Filter className="h-3.5 w-3.5" />仅看品牌文章
            </button>
            <span className="ml-auto text-[11px] text-[var(--ink-3)]">{citations.length} 条结果</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--line)] text-left">
                <th className="py-3 pl-[22px] pr-4 text-[11px] font-semibold text-[var(--ink-3)]">文章标题</th>
                <th className="py-3 pr-4 text-[11px] font-semibold text-[var(--ink-3)] w-24">发布站点</th>
                <th className="py-3 pr-4 text-[11px] font-semibold text-[var(--ink-3)] w-20 text-right">引用次数</th>
                <th className="py-3 pr-4 text-[11px] font-semibold text-[var(--ink-3)] w-24 text-right">引用文章数</th>
                <th className="py-3 pr-[22px] text-[11px] font-semibold text-[var(--ink-3)] w-20">趋势</th>
              </tr>
            </thead>
            <tbody>
              {citations.map((row, i) => (
                <tr key={i} className="border-b border-[var(--line-2)] last:border-0 hover:bg-[var(--fill-quaternary)] transition-colors">
                  <td className="py-3 pl-[22px] pr-4">
                    <div className="text-[14px] font-semibold text-[var(--ink)]">{row.title}</div>
                    <MiniBar count={row.count} max={maxCount} />
                  </td>
                  <td className="py-3 pr-4"><span className="soft-badge">{row.site}</span></td>
                  <td className="py-3 pr-4 text-[14px] font-semibold text-[var(--accent-d)] text-right num">{row.count.toLocaleString()}</td>
                  <td className="py-3 pr-4 text-[13px] text-[var(--ink-2)] text-right num">{row.articles}</td>
                  <td className="py-3 pr-[22px]">
                    <span className={cn('inline-flex items-center gap-1 text-[11.5px] font-semibold',
                      row.trend === 'up' ? 'text-[var(--accent-d)]' : row.trend === 'down' ? 'text-[var(--red)]' : 'text-[var(--ink-3)]')}>
                      {row.trend === 'up' ? '↗' : row.trend === 'down' ? '↘' : '→'} {row.trend === 'up' ? '增长' : row.trend === 'down' ? '下降' : '持平'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Right Column ===== */}
      <div className="flex flex-col gap-4">
        {/* Top Sites */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <h3 className="text-[15px] font-semibold">引用站点排名</h3>
          <div className="text-[11.5px] text-[var(--ink-3)] mb-4">按引用频次</div>
          {[
            { name: '知乎', count: 3_240, pct: 28 },
            { name: '36氪', count: 2_890, pct: 25 },
            { name: 'CSDN', count: 2_150, pct: 18 },
            { name: 'InfoQ', count: 1_780, pct: 15 },
            { name: '少数派', count: 1_620, pct: 14 },
          ].map((s, i) => (
            <div key={s.name} className="flex items-center gap-3 py-2.5 border-b border-[var(--line-2)] last:border-0">
              <span className={cn('w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[10px] font-bold shrink-0',
                i === 0 ? 'bg-[var(--accent)] text-white' : i === 1 ? 'bg-[var(--accent-soft)] text-[var(--accent-d)]' : 'text-[var(--ink-3)]')}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[12.5px] mb-1"><b className="font-semibold">{s.name}</b><span className="num text-[var(--ink-2)]">{s.count.toLocaleString()}</span></div>
                <div className="h-[5px] rounded-[3px] bg-[var(--bg)] overflow-hidden">
                  <div className="h-full rounded-[3px]" style={{ width: `${s.pct}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-d))' }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <h3 className="text-[15px] font-semibold">快捷操作</h3>
          <div className="text-[11.5px] text-[var(--ink-3)] mb-4">引用分析工具</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <FileText className="w-4 h-4" />, label: '查看报告', color: 'var(--accent-d)' },
              { icon: <Download className="w-4 h-4" />, label: '导出数据', color: 'var(--blue)' },
              { icon: <TrendingUp className="w-4 h-4" />, label: '趋势分析', color: 'var(--purple)' },
              { icon: <Link2 className="w-4 h-4" />, label: '分享链接', color: 'var(--teal)' },
              { icon: <ExternalLink className="w-4 h-4" />, label: '查看原文', color: 'var(--orange)' },
              { icon: <Filter className="w-4 h-4" />, label: '筛选过滤', color: 'var(--ink-2)' },
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

        {/* 主要引用源 — avatar cluster style */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold">主要引用源</h3>
            <span className="text-[var(--ink-3)] cursor-pointer text-[18px] leading-none">⋮</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { name: '知乎', color: 'var(--blue)' },
              { name: '36氪', color: 'var(--accent-d)' },
              { name: 'CSDN', color: 'var(--red)' },
              { name: 'InfoQ', color: 'var(--purple)' },
              { name: '少数派', color: 'var(--teal)' },
              { name: '掘金', color: 'var(--orange)' },
            ].map(p => (
              <div key={p.name} className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}dd)` }}>
                  {p.name.charAt(0)}
                </div>
                <span className="text-[10px] text-[var(--ink-3)]">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Insight */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-d))' }}>
              <TrendingUp className="w-4 h-4 text-white" strokeWidth={1.7} />
            </div>
            <h3 className="text-[15px] font-semibold">引用趋势洞察</h3>
          </div>
          <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed mt-2">
            知乎和36氪是最主要的引用来源，合计占比超过53%。
          </p>
          <a href="/content/management" className="text-[var(--accent-d)] font-semibold text-[12.5px] no-underline inline-flex gap-1.5 items-center mt-3 hover:underline">
            <FileText className="w-3.5 h-3.5" />查看内容策略
          </a>
        </div>
      </div>
    </div>
  )
}
