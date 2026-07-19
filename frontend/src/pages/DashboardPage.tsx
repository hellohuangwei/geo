import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Edit3, Plus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { GaugeRing } from '@/components/ui/gauge-ring'
import { fetchActivitiesApi, type ActivityItem } from '@/api/activities'
import { fetchBrandProfileApi, type BrandProfile } from '@/api/brandProfile'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

import deepseekSvg from '/resources/deepseek.svg'
import doubaoSvg from '/resources/doubao.svg'
import kimiSvg from '/resources/kimi.svg'
import namiSvg from '/resources/nami.svg'
import tongyiSvg from '/resources/tongyi-qianwen.svg'
import wenxinSvg from '/resources/wenxin-yiyan.svg'
import yuanbaoSvg from '/resources/yuanbao.svg'
import zhipuSvg from '/resources/zhipu-qingyan.svg'

const fallbackActivities: ActivityItem[] = [
  { activityType: 'knowledge', done: false, title: '上传知识库文件', description: '充实品牌知识以提升 AI 引用准确度', createTime: '2026-07-01T08:00:00', targetId: null },
  { activityType: 'article', done: true, title: '编辑文章 - 新能源车与燃油车的抉择', description: '已更新文章内容', createTime: '2026-07-15T00:46:00', targetId: null },
  { activityType: 'article', done: true, title: '发布文章 - 新能源车与燃油车的抉择', description: '已将文章发布到 3 个平台', createTime: '2026-07-14T12:18:00', targetId: null },
  { activityType: 'article', done: true, title: '发布文章', description: '已生成并发布 2 篇关于「汽车」的文章', createTime: '2026-07-14T00:39:00', targetId: null },
  { activityType: 'article', done: true, title: '编辑文章 - 20 万预算购车决策', description: '已更新文章内容', createTime: '2026-07-14T00:35:00', targetId: null },
  { activityType: 'article', done: true, title: '编辑文章 - 短剧平台选择指南', description: '已更新文章内容', createTime: '2026-07-14T00:25:00', targetId: null },
]

const platformIconMap: Record<string, string> = {
  DeepSeek: deepseekSvg,
  豆包: doubaoSvg,
  通义千问: tongyiSvg,
  Kimi: kimiSvg,
  元宝: yuanbaoSvg,
  文心一言: wenxinSvg,
  智谱清言: zhipuSvg,
  Nami: namiSvg,
}

const platformUrlMap: Record<string, string> = {
  DeepSeek: 'https://chat.deepseek.com',
  豆包: 'https://www.doubao.com',
  通义千问: 'https://tongyi.aliyun.com',
  Kimi: 'https://kimi.moonshot.cn',
  元宝: 'https://yuanbao.tencent.com',
  文心一言: 'https://yiyan.baidu.com',
  智谱清言: 'https://chatglm.cn',
  Nami: 'https://www.n.cn',
}

const kpi = [
  { label: '可见度', value: '72.5%', delta: '+5.2%', up: true },
  { label: '平均排名', value: '2.3', delta: 'Top 15%', up: true },
  { label: '监控问题', value: '1,386', delta: '8 个平台', up: null },
  { label: '今日更新', value: '247', delta: '15min 前', up: null },
]

const ranking = [
  { rank: 1, brand: '飞书 Feishu', vis: '78.3%', delta: '+6.1%', up: true },
  { rank: 2, brand: '钉钉 DingTalk', vis: '72.5%', delta: '+5.2%', up: true },
  { rank: 3, brand: '企业微信 WeCom', vis: '68.9%', delta: '+4.3%', up: true },
  { rank: 4, brand: 'Notion', vis: '62.1%', delta: '-2.1%', up: false },
  { rank: 5, brand: 'Airtable', vis: '55.4%', delta: '+1.8%', up: true },
  { rank: 6, brand: 'Slack', vis: '48.7%', delta: '+2.4%', up: true },
  { rank: 7, brand: 'Teams', vis: '42.3%', delta: '-0.8%', up: false },
]

const aiPlatforms = [
  { name: 'DeepSeek', rate: 28.5 },
  { name: '豆包', rate: 21.2 },
  { name: '通义千问', rate: 15.8 },
  { name: 'Kimi', rate: 12.3 },
  { name: '元宝', rate: 9.6 },
  { name: '文心一言', rate: 6.4 },
  { name: '智谱清言', rate: 4.1 },
  { name: 'Nami', rate: 2.1 },
]

const citeTrend = [18.2, 19.5, 21, 20.3, 22.8, 23.5, 24.6]

const allTopics = [
  { topic: '协同办公效率提升', mentions: 342, trend: '↗', hot: true, pct: 94 },
  { topic: '企业数字化转型', mentions: 287, trend: '↗', hot: true, pct: 82 },
  { topic: 'AI 原生组织架构', mentions: 256, trend: '↑', hot: false, pct: 71 },
  { topic: '低代码/无代码平台', mentions: 198, trend: '→', hot: false, pct: 55 },
  { topic: '数据安全合规', mentions: 165, trend: '↗', hot: false, pct: 46 },
  { topic: '远程协作工具选型', mentions: 142, trend: '↑', hot: false, pct: 39 },
  { topic: 'SaaS 出海本地化', mentions: 118, trend: '↗', hot: false, pct: 32 },
]

function useCountUp(target: number, duration = 800, enabled = true) {
  const [value, setValue] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setValue(target)
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased * 10) / 10)
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration, enabled])

  return value
}

function Sparkline({ data, width = 160, height = 62, color = 'var(--accent-d)' }: { data: number[]; width?: number; height?: number; color?: string }) {
  const pad = 5
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  }))
  const lineD = pts.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`
    const prev = pts[i - 1]
    const cpx1 = prev.x + (p.x - prev.x) / 3
    const cpx2 = p.x - (p.x - prev.x) / 3
    return `C${cpx1},${prev.y} ${cpx2},${p.y} ${p.x},${p.y}`
  }).join(' ')
  const last = pts[pts.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={lineD} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      <circle cx={last.x} cy={last.y} r="4.5" fill="var(--card)" stroke={color} strokeWidth="2" />
    </svg>
  )
}

function AiLogo({ name, size = 30 }: { name: string; size?: number }) {
  const src = platformIconMap[name]
  if (src) return <img src={src} alt={name} style={{ width: size, height: size }} className="object-contain" />
  return (
    <div className="flex items-center justify-center rounded-[8px] bg-[var(--accent-d)] text-[10px] font-bold text-white" style={{ width: size, height: size }}>
      {name.charAt(0)}
    </div>
  )
}

function DashboardCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[13px] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-card)]', className)}>
      {children}
    </section>
  )
}

function TopicTrends() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('全部话题')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = selected === '全部话题' ? allTopics : allTopics.filter((t) => t.topic === selected)

  return (
    <DashboardCard className="flex h-[442px] flex-col p-[20px]">
      <div ref={containerRef}>
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-[14px] font-semibold text-[var(--ink)]">话题热门资讯</h4>
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="rounded-[8px] bg-[var(--bg)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--fill-tertiary)]"
            >
              {selected}⌄
            </button>
            {open && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--card)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                {['全部话题', ...allTopics.map((t) => t.topic)].map((label) => (
                  <button
                    key={label}
                    onClick={() => { setSelected(label); setOpen(false) }}
                    className={cn(
                      'w-full px-3 py-2 text-left text-[12px] transition-colors',
                      selected === label ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-d)]' : 'text-[var(--ink)] hover:bg-[var(--fill-quaternary)]',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {filtered.map((t, i) => (
            <div key={t.topic} className="group flex items-center gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-[var(--fill-quaternary)]">
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[10.5px] font-bold', i === 0 ? 'bg-[var(--accent)] text-white' : 'bg-[var(--fill-tertiary)] text-[var(--ink-3)]')}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-[var(--ink)]">{t.topic}</span>
                  {t.hot && <span className="rounded-[4px] bg-[rgba(229,106,90,0.08)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[var(--red)]">热</span>}
                </div>
              </div>
              <span className="shrink-0 text-[11.5px] text-[var(--ink-3)]">{t.mentions} 次引用</span>
              <span className={cn('w-4 shrink-0 text-right text-[13px] font-semibold', t.trend === '→' ? 'text-[var(--ink-3)]' : 'text-[var(--accent-d)]')}>{t.trend}</span>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  )
}

function activityMeta(type: string) {
  const iconMap: Record<string, string> = { brand: 'B', product: 'P', topic: 'T', knowledge: 'K', article: 'A' }
  const colorMap: Record<string, string> = {
    brand: 'var(--accent-d)',
    product: 'var(--blue)',
    topic: 'var(--purple)',
    knowledge: 'var(--teal)',
    article: 'var(--orange)',
  }
  const pathMap: Record<string, string> = {
    brand: '/settings/brand-profile',
    product: '/settings/product-profile',
    topic: '/settings/topics',
    knowledge: '/knowledge-base',
    article: '/content/management',
  }

  return {
    icon: iconMap[type] || '?',
    color: colorMap[type] || 'var(--accent)',
    path: pathMap[type] || '/dashboard',
  }
}

export function DashboardPage() {
  const navigate = useNavigate()
  const isLoading = useAuthStore((s) => s.isLoading)
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>(fallbackActivities)
  const [brandLoading, setBrandLoading] = useState(true)
  const [heroVisible, setHeroVisible] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHeroVisible(true)
        observer.disconnect()
      }
    }, { threshold: 0.3 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    fetchBrandProfileApi()
      .then((data) => setBrandProfile(data?.brandName ? data : null))
      .catch(() => setBrandProfile(null))
      .finally(() => setBrandLoading(false))

    fetchActivitiesApi()
      .then((data) => { if (data?.length) setActivities(data) })
      .catch(() => {})
  }, [])

  const visScore = useCountUp(100, 1000, heroVisible)
  const citeRate = useCountUp(24.6, 1000, heroVisible)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.78fr_1.65fr_1.15fr]">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[232px] rounded-[16px]" />)}
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-[16px]" />)}
        </div>
      </div>
    )
  }

  return (
    <div ref={heroRef} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.22fr)_minmax(214px,0.95fr)_minmax(450px,2.04fr)]">
          <DashboardCard className="h-[220px] p-[20px]">
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="mb-[18px] flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-[var(--ink)] tracking-[-0.01em]">品牌可见度</h3>
                <span className="rounded-[7px] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent-d)] tracking-[0.02em]">S 级</span>
              </div>
              {/* Body: 数字 + 圆环 */}
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <span className="num text-[64px] font-extrabold leading-[0.9] tracking-[-0.04em] text-[var(--ink)] tabular-nums">
                    {visScore}
                  </span>
                  <span className="ml-0.5 text-[13px] font-medium tracking-[0.02em] text-[var(--ink-3)]">
                    / 100
                  </span>
                </div>
                <div className="mt-1">
                  <GaugeRing pct={visScore} size={88} stroke={4.5} />
                </div>
              </div>
              {/* Footer: 进度条 */}
              <div className="mt-auto w-full">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11.5px] text-[var(--ink-2)]">
                    超越 <b className="font-semibold tabular-nums text-[var(--ink)]">85%</b> 品牌
                  </span>
                  <span className="num text-[12px] font-bold tracking-[0.01em] text-[var(--accent-d)]">Top 15%</span>
                </div>
                <div className="h-[5px] overflow-hidden rounded-full bg-[var(--fill-tertiary)]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-l),var(--accent))]" style={{ width: '85%' }} />
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard className="h-[220px] p-[20px]">
            <div className="flex h-full flex-col">
              <h3 className="text-[14px] font-semibold text-[var(--ink)] tracking-[-0.01em]">AI 引用率</h3>
              <div className="flex flex-1 flex-col justify-center">
                <div className="flex items-baseline gap-0.5">
                  <span className="num text-[54px] font-extrabold leading-[0.95] tracking-[-0.04em] text-[var(--ink)] tabular-nums">{citeRate}</span>
                  <span className="text-[16px] font-bold text-[var(--ink-3)]">%</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--accent-soft)] px-2 py-1 text-[11.5px] font-bold text-[var(--accent-d)]">
                    <ArrowUp className="h-3 w-3" />1.1%
                  </span>
                  <span className="text-[12px] text-[var(--ink-3)]">较昨日</span>
                </div>
                <div className="mt-4">
                  <Sparkline data={citeTrend} width={176} height={44} />
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard className="h-[220px] p-[20px]">
            <div className="flex h-full items-center">
              <div className="grid w-full grid-cols-4 gap-x-3 gap-y-2">
                {aiPlatforms.map((platform) => (
                  <a
                    key={platform.name}
                    href={platformUrlMap[platform.name] || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center justify-center rounded-[10px] py-0.5 no-underline transition-colors hover:bg-[var(--fill-quaternary)]"
                  >
                    <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--bg)]">
                      <AiLogo name={platform.name} size={26} />
                    </div>
                    <span className="text-center text-[11.5px] font-semibold leading-tight text-[var(--ink)]">{platform.name}</span>
                    <span className={cn('num mt-0.5 text-[12.5px] font-bold', platform.rate >= 20 ? 'text-[var(--accent-d)]' : platform.rate >= 10 ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]')}>
                      {platform.rate}%
                    </span>
                    <span className="mt-1 h-[2.5px] w-7 overflow-hidden rounded-full bg-[var(--fill-tertiary)]">
                      <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(platform.rate, 8)}%` }} />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </DashboardCard>
        </div>

        <div className="grid grid-cols-2 gap-5 lg:grid-cols-[1.2fr_1.2fr_1.1fr_0.85fr]">
          {kpi.map((item) => (
            <DashboardCard key={item.label} className="h-[122px] p-[20px] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
              <div className="text-[12px] font-semibold text-[var(--ink-2)]">{item.label}</div>
              <div className="num mt-2 text-[32px] font-bold leading-none tracking-[-0.03em] text-[var(--ink)]">{item.value}</div>
              <div className={cn('mt-2 text-[12px] font-semibold', item.up === true ? 'text-[var(--accent-d)]' : item.up === false ? 'text-[var(--red)]' : 'text-[var(--ink-2)]')}>
                {item.up === true && <ArrowUp className="mr-0.5 inline h-3 w-3" />}
                {item.up === false && <ArrowDown className="mr-0.5 inline h-3 w-3" />}
                {item.delta}
              </div>
            </DashboardCard>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <DashboardCard className="h-[442px] overflow-hidden p-[20px]">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-[14px] font-semibold text-[var(--ink)]">竞争排名</h4>
              <span className="rounded-[8px] bg-[var(--bg)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink-2)]">全部⌄</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {ranking.map((item, i) => (
                <div key={item.rank} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-[var(--fill-quaternary)]">
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[10.5px] font-bold', item.rank === 1 ? 'bg-[var(--accent)] text-white' : item.rank === 2 ? 'bg-[var(--accent-soft)] text-[var(--accent-d)]' : 'bg-[var(--fill-tertiary)] text-[var(--ink-3)]')}>
                    {item.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate text-[13px] font-semibold text-[var(--ink)]">{item.brand}</span>
                      <span className="num shrink-0 text-[12.5px] font-semibold text-[var(--ink)]">{item.vis}</span>
                    </div>
                    <div className="h-[5px] overflow-hidden rounded-full bg-[var(--fill-tertiary)]">
                      <div className="h-full rounded-full" style={{ width: item.vis, background: i === 0 ? 'var(--accent)' : i === 1 ? 'var(--accent-l)' : i === 2 ? 'var(--blue)' : 'var(--fill-primary)' }} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      {item.up ? <ArrowUp className="h-3 w-3 text-[var(--accent-d)]" /> : <ArrowDown className="h-3 w-3 text-[var(--red)]" />}
                      <span className={cn('text-[11.5px] font-semibold', item.up ? 'text-[var(--accent-d)]' : 'text-[var(--red)]')}>{item.delta}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <TopicTrends />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <DashboardCard className="h-[264px] p-[20px]">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-[14px] font-semibold text-[var(--ink)]">品牌身份</h4>
            {brandProfile && (
              <button
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--ink-2)] transition-colors hover:text-[var(--accent-d)]"
                onClick={() => navigate('/settings/brand-profile', { state: { edit: true } })}
              >
                <Edit3 className="h-3.5 w-3.5" />编辑
              </button>
            )}
          </div>

          {brandLoading ? (
            <Skeleton className="mt-4 h-[190px] w-full rounded-[16px]" />
          ) : brandProfile ? (
            <button
              onClick={() => navigate('/settings/brand-profile')}
              className="mt-4 flex min-h-[174px] w-full flex-col rounded-[13px] bg-[linear-gradient(135deg,var(--accent),var(--accent-d))] px-5 py-4 text-left text-white shadow-[0_10px_24px_rgba(111,168,56,0.25)] transition-transform hover:scale-[1.01]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="text-[11px] font-semibold opacity-80">品牌档案</span>
                <span className="max-w-[170px] truncate text-right text-[22px] font-bold leading-tight tracking-[-0.02em]">{brandProfile.brandName || 'GEO'}</span>
              </div>
              <div className="my-6 h-px bg-white/18" />
              <div className="text-[12px] font-semibold opacity-90">{brandProfile.industry || brandProfile.description || '完善品牌信息'}</div>
              <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[11px]">
                <span className="truncate opacity-80">{brandProfile.serviceArea || brandProfile.website?.replace(/^https?:\/\//, '') || '全网'}</span>
                <span className="num shrink-0 opacity-70">Since {brandProfile.createTime?.substring(0, 4) || '2026'}</span>
              </div>
            </button>
          ) : (
            <button
              onClick={() => navigate('/settings/brand-profile')}
              className="mt-4 flex h-[190px] w-full flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed border-[var(--line)] bg-[var(--fill-quaternary)] p-5 text-center transition-opacity hover:opacity-85"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--card)] shadow-[var(--shadow-card)]">
                <Plus className="h-5 w-5 text-[var(--ink-2)]" />
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-[var(--ink)]">创建品牌档案</span>
                <span className="mt-0.5 block text-[11.5px] text-[var(--ink-3)]">完善品牌信息以开启 AI 监测</span>
              </span>
            </button>
          )}
        </DashboardCard>

        <DashboardCard className="flex h-[589px] flex-col overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h4 className="text-[14px] font-semibold text-[var(--ink)]">活动日志</h4>
          </div>
          <div className="min-h-0 flex-1 px-5 py-1">
            {activities.map((item, idx) => {
              const meta = activityMeta(item.activityType)
              return (
                <button
                  key={`${item.activityType}-${idx}`}
                  onClick={() => {
                    if (item.activityType === 'article' && item.targetId) navigate(`/content/articles/${item.targetId}`)
                    else if (item.activityType === 'product' && item.targetId) navigate(`/settings/product-profile/${item.targetId}`)
                    else navigate(meta.path)
                  }}
                  className="flex w-full items-center gap-3 border-b border-[var(--line-2)] px-1 py-2.5 text-left last:border-0"
                >
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] text-[11.5px] font-bold text-white" style={{ background: meta.color }}>
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">{item.title}</span>
                    <span className="block truncate text-[11.5px] text-[var(--ink-3)]">{item.description}</span>
                    {item.createTime && (
                      <span className="mt-0.5 block text-[10.5px] text-[var(--ink-3)]">
                        {new Date(item.createTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </span>
                  <span className={cn('shrink-0 text-[11.5px] font-semibold', item.done ? 'text-[var(--accent-d)]' : 'text-[var(--red)]')}>
                    {item.done ? '已完成' : '待处理'}
                  </span>
                </button>
              )
            })}
          </div>
          <button className="mx-5 mb-4 mt-1 inline-flex w-fit items-center text-[12px] font-semibold text-[var(--ink-2)] transition-colors hover:text-[var(--accent-d)]">
            查看全部日志 →
          </button>
        </DashboardCard>
      </div>
    </div>
  )
}
