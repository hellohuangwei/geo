import { BarChart3, Smile, Meh, Frown, TrendingUp, MessageCircle, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

const sentiments = [
  { value: '62%', label: '正面', icon: Smile, color: 'var(--accent-d)', bg: 'rgba(111,168,56,0.08)' },
  { value: '28%', label: '中性', icon: Meh, color: 'var(--ink-2)', bg: 'var(--fill-tertiary)' },
  { value: '10%', label: '负面', icon: Frown, color: 'var(--red)', bg: 'rgba(229,106,90,0.08)' },
]

const positiveReasons = [
  { text: '产品功能完善，用户口碑好', pct: 35 },
  { text: '价格具有竞争力', pct: 25 },
  { text: '售后服务响应及时', pct: 18 },
  { text: '集成生态丰富', pct: 14 },
  { text: '操作界面简洁易用', pct: 8 },
]
const negativeReasons = [
  { text: '部分高级功能学习成本高', pct: 40 },
  { text: '移动端体验有待提升', pct: 33 },
  { text: '与某些第三方工具兼容性问题', pct: 27 },
]

export function BrandSentimentPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* Left */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--ink)] tracking-[-0.02em]">品牌情感</h1>
          <p className="text-[11.5px] text-[var(--ink-3)] mt-0.5">分析AI平台对品牌的情感倾向</p>
        </div>

        {/* Sentiment big cards */}
        <div className="grid grid-cols-3 gap-4">
          {sentiments.map((s) => (
            <div key={s.label} className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-5 shadow-[var(--shadow-card)] text-center">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-[14px] flex items-center justify-center" style={{ background: s.bg }}>
                  <s.icon className="h-5 w-5" style={{ color: s.color }} strokeWidth={1.7} />
                </div>
              </div>
              <p className="text-[34px] font-extrabold tracking-[-0.03em] num" style={{ color: s.color }}>{s.value}</p>
              <p className="mt-1 text-[12px] font-semibold text-[var(--ink-2)]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Reasons row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Positive */}
          <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-[22px] py-4 flex items-center gap-2 border-b border-[var(--line)]">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'rgba(111,168,56,0.10)' }}>
                <Smile className="h-4 w-4 text-[var(--accent-d)]" strokeWidth={1.7} />
              </div>
              <h2 className="text-[15px] font-semibold">正面原因</h2>
            </div>
            <div className="p-[22px]">
              {positiveReasons.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[var(--line-2)] last:border-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                  <span className="text-[13px] text-[var(--ink)]/80 flex-1">{r.text}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-[5px] w-16 rounded-[3px] bg-[var(--bg)] overflow-hidden">
                      <div className="h-full rounded-[3px]" style={{ width: `${r.pct}%`, background: 'var(--accent)' }} />
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--ink-2)] num w-8 text-right">{r.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Negative */}
          <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-[22px] py-4 flex items-center gap-2 border-b border-[var(--line)]">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'rgba(229,106,90,0.10)' }}>
                <Frown className="h-4 w-4 text-[var(--red)]" strokeWidth={1.7} />
              </div>
              <h2 className="text-[15px] font-semibold">负面原因</h2>
            </div>
            <div className="p-[22px]">
              {negativeReasons.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[var(--line-2)] last:border-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--red)' }} />
                  <span className="text-[13px] text-[var(--ink)]/80 flex-1">{r.text}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-[5px] w-16 rounded-[3px] bg-[var(--bg)] overflow-hidden">
                      <div className="h-full rounded-[3px]" style={{ width: `${r.pct}%`, background: 'var(--red)' }} />
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--ink-2)] num w-8 text-right">{r.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trend placeholder */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-[22px] py-4 flex items-center gap-2 border-b border-[var(--line)]">
            <div className="w-8 h-8 rounded-[10px] bg-[var(--fill-tertiary)] flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-[var(--accent-d)]" strokeWidth={1.7} />
            </div>
            <h2 className="text-[15px] font-semibold">情感趋势 — 最近 15 天</h2>
          </div>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-[14px] bg-[var(--fill-tertiary)] flex items-center justify-center mb-4">
              <BarChart3 className="h-6 w-6 text-[var(--ink-3)]" />
            </div>
            <p className="text-[14px] font-medium text-[var(--ink-3)]">情感趋势图表即将上线</p>
            <p className="text-[11.5px] text-[var(--ink-3)]/60 mt-1">ECharts 集成开发中</p>
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="flex flex-col gap-4">
        {/* Quick actions */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <h3 className="text-[15px] font-semibold">快捷操作</h3>
          <div className="text-[11.5px] text-[var(--ink-3)] mb-4">情感分析工具</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <TrendingUp className="w-4 h-4" />, label: '趋势报告', color: 'var(--accent-d)' },
              { icon: <Download className="w-4 h-4" />, label: '导出数据', color: 'var(--blue)' },
              { icon: <BarChart3 className="w-4 h-4" />, label: '详细图表', color: 'var(--purple)' },
              { icon: <MessageCircle className="w-4 h-4" />, label: '查看评论', color: 'var(--teal)' },
              { icon: <Smile className="w-4 h-4" />, label: '正面分析', color: 'var(--orange)' },
              { icon: <Frown className="w-4 h-4" />, label: '负面预警', color: 'var(--red)' },
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

        {/* Donut summary */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)] text-center">
          <h3 className="text-[15px] font-semibold text-left">情感概览</h3>
          <div className="relative inline-flex items-center justify-center my-3">
            <svg width="120" height="120" className="-rotate-90" role="img" aria-label="情感概览：62% 正面，28% 中性，10% 负面">
              <circle cx="60" cy="60" r="48" fill="none" stroke="var(--line)" strokeWidth="12" />
              <circle cx="60" cy="60" r="48" fill="none" stroke="var(--accent-d)" strokeWidth="12"
                strokeDasharray={2 * Math.PI * 48} strokeDashoffset={2 * Math.PI * 48 * (1 - 0.62)} strokeLinecap="round" />
              <circle cx="60" cy="60" r="48" fill="none" stroke="var(--ink-2)" strokeWidth="12"
                strokeDasharray={2 * Math.PI * 48} strokeDashoffset={2 * Math.PI * 48 * (1 - 0.90)} strokeLinecap="round"
                style={{ transform: `rotate(${360 * 0.62}deg)`, transformOrigin: 'center' }} />
            </svg>
            <span className="absolute text-[22px] font-extrabold num text-[var(--accent-d)]">62%</span>
          </div>
          <div className="flex justify-center gap-5 text-[11px] font-semibold text-[var(--ink-2)]">
            <span><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: 'var(--accent-d)' }} />正面 62%</span>
            <span><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: 'var(--ink-2)' }} />中性 28%</span>
            <span><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: 'var(--red)' }} />负面 10%</span>
          </div>
        </div>

        {/* AI Platforms with sentiment — avatar cluster style */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold">平台情感分布</h3>
            <span className="text-[var(--ink-3)] cursor-pointer text-[18px] leading-none">⋮</span>
          </div>
          <div className="flex gap-1.5 flex-wrap mb-4">
            {[
              { name: 'ChatGPT', color: 'var(--accent-d)' },
              { name: 'DeepSeek', color: 'var(--blue)' },
              { name: '豆包', color: 'var(--teal)' },
              { name: '千问', color: 'var(--orange)' },
              { name: 'Kimi', color: 'var(--purple)' },
              { name: '百度AI', color: 'var(--red)' },
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
          {[
            { name: 'ChatGPT', pos: 68, neg: 8, color: 'var(--accent-d)' },
            { name: 'DeepSeek', pos: 62, neg: 12, color: 'var(--blue)' },
            { name: '豆包', pos: 70, neg: 6, color: 'var(--teal)' },
            { name: '千问', pos: 55, neg: 15, color: 'var(--orange)' },
          ].map(p => (
            <div key={p.name} className="flex items-center gap-2 py-2 border-b border-[var(--line-2)] last:border-0">
              <span className="text-[11px] text-[var(--ink-2)] w-12 shrink-0">{p.name}</span>
              <div className="flex-1 h-[6px] rounded-[3px] bg-[var(--bg)] flex overflow-hidden">
                <div className="h-full rounded-l-[3px]" style={{ width: `${p.pos}%`, background: p.color }} />
                <div className="h-full rounded-r-[3px]" style={{ width: `${p.neg}%`, background: 'var(--red)' }} />
              </div>
              <span className="text-[10px] font-semibold num w-8 text-right" style={{ color: p.color }}>{p.pos}%</span>
            </div>
          ))}
        </div>

        {/* Insight */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-d))' }}>
              <MessageCircle className="w-4 h-4 text-white" strokeWidth={1.7} />
            </div>
            <h3 className="text-[15px] font-semibold">优化建议</h3>
          </div>
          <div className="text-[12.5px] text-[var(--ink-2)] leading-relaxed space-y-2.5 mt-2">
            <p>正面评价主要来自产品功能和价格优势，建议在AI内容生成中重点突出。</p>
            <p>负面反馈集中在学习成本和移动端，可优化新手引导和移动端适配。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
