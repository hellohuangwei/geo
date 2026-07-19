import { useState } from 'react'
import { cn } from '@/lib/utils'

const topics = [
  { id: 1, label: '企业协同办公的 AI 未来趋势', badge: 1, color: 'var(--accent)' },
  { id: 2, label: 'B2B SaaS 中大模型最佳实践', badge: 2, color: 'var(--blue)' },
  { id: 3, label: 'AI 提升品牌搜索可见度', badge: 3, color: 'var(--teal)' },
  { id: 4, label: 'LLM 评估框架与排名解析', badge: 4, color: 'var(--orange)' },
  { id: 5, label: '多平台 AI 内容分发策略', badge: 5, color: 'var(--purple)' },
  { id: 6, label: '实时监控与异常预警设计', badge: 6, color: 'var(--accent-d)' },
]

const positions = [
  { x: 20, y: 22 },
  { x: 72, y: 20 },
  { x: 74, y: 44 },
  { x: 72, y: 72 },
  { x: 30, y: 76 },
  { x: 14, y: 56 },
]

const CENTER = { x: 50, y: 52 }

function curvePath(from: { x: number; y: number }, to: { x: number; y: number }, curvature: number): string {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  return `M ${from.x}% ${from.y}% Q ${midX - dy * curvature}% ${midY + dx * curvature}% ${to.x}% ${to.y}%`
}

export function HotTopics() {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className="relative w-full h-full overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--card)] select-none"
      style={{ containerType: 'inline-size' }}
      role="img"
      aria-label="热门问题追踪：企业协同办公的AI未来趋势、B2B SaaS中大模型最佳实践等6个话题"
    >
      {/* ===== 标题 ===== */}
      <div className="absolute top-5 left-5 z-[5]">
        <p className="font-semibold text-[var(--ink)]/80" style={{ fontSize: 'clamp(12px, 2.8cqw, 15px)' }}>
          热门问题追踪
        </p>
      </div>

      {/* ===== 轨道环 & 连接线 ===== */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 100 100" preserveAspectRatio="none">
        <ellipse cx="50" cy="48" rx="42" ry="38" fill="none" stroke="var(--line)" strokeWidth="0.3" strokeDasharray="1.5 3" />
        <ellipse cx="50" cy="48" rx="32" ry="28" fill="none" stroke="var(--line)" strokeWidth="0.4" strokeDasharray="2 4" />
        <ellipse cx="50" cy="48" rx="20" ry="17" fill="none" stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2 3" />

        {positions.map((pos, i) => (
          <path
            key={i}
            d={curvePath(pos, CENTER, 0.15)}
            fill="none"
            stroke={hovered === topics[i].id ? topics[i].color : 'var(--ink-3)'}
            strokeWidth={hovered === topics[i].id ? '0.8' : '0.3'}
            opacity={hovered === topics[i].id ? 1 : 0.35}
            className="transition-all duration-300 ease-out"
          />
        ))}

        {hovered !== null && (
          <circle r="0.7" fill={topics.find((t) => t.id === hovered)!.color} opacity="0.8">
            <animateMotion dur="2s" repeatCount="indefinite"
              path={curvePath(positions[topics.findIndex((t) => t.id === hovered)], CENTER, 0.15)} />
          </circle>
        )}
      </svg>

      {/* ===== Glow 光晕 ===== */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[48%] pointer-events-none z-[1]"
        style={{ width: 'clamp(160px, 35cqw, 260px)', height: 'clamp(160px, 35cqw, 260px)' }}>
        <div className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(139,195,74,0.06) 0%, rgba(174,225,90,0.03) 30%, transparent 70%)',
            animationDuration: '4s',
          }} />
        <div className="absolute inset-8 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139,195,74,0.10) 0%, rgba(174,225,90,0.05) 40%, transparent 70%)',
            animation: 'breathe 3s ease-in-out infinite',
          }} />
      </div>

      {/* ===== AI Core ===== */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[48%] z-10 pointer-events-none"
        style={{ animation: 'breathe 3s ease-in-out infinite' }}>
        <div className="rounded-full border border-[var(--accent)]/25 flex items-center justify-center"
          style={{
            width: 'clamp(50px, 14cqw, 72px)', height: 'clamp(50px, 14cqw, 72px)',
            background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.9) 0%, rgba(139,195,74,0.10) 50%, rgba(174,225,90,0.05) 100%)',
            boxShadow: '0 0 30px rgba(139,195,74,0.08), 0 4px 16px rgba(0,0,0,0.04)',
          }}>
          <div className="rounded-full flex items-center justify-center"
            style={{
              width: 'clamp(34px, 60%, 44px)', height: 'clamp(34px, 60%, 44px)',
              background: 'linear-gradient(135deg, var(--accent-l) 0%, var(--accent) 40%, var(--accent-d) 100%)',
              boxShadow: '0 2px 12px rgba(111,168,56,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}>
            <svg width="clamp(16px, 40%, 20px)" height="clamp(16px, 40%, 20px)" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'clamp(15px, 2.2vw, 20px)', height: 'clamp(15px, 2.2vw, 20px)' }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M1 12h4M19 12h4" opacity="0.6" />
              <path d="M4.2 4.2l2.8 2.8M17 17l2.8 2.8M4.2 19.8l2.8-2.8M17 7l2.8-2.8" opacity="0.3" />
            </svg>
          </div>
        </div>
      </div>

      {/* ===== 热门问题胶囊 ===== */}
      {topics.map((topic, i) => {
        const pos = positions[i]
        const isHovered = hovered === topic.id
        const isOtherHovered = hovered !== null && hovered !== topic.id

        return (
          <div
            key={topic.id}
            className={cn(
              'absolute z-20 flex items-center gap-2 px-3 py-2 cursor-pointer',
              'rounded-full border border-[var(--line)]',
              'transition-all duration-300 ease-out',
              isOtherHovered && 'opacity-35',
            )}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%)${isHovered ? ' scale(1.03) translateY(-3px)' : ''}`,
              background: isHovered ? 'var(--card)' : 'rgba(255,255,255,0.80)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: isHovered
                ? `0 6px 20px rgba(0,0,0,0.06), 0 0 16px ${topic.color}18`
                : '0 1px 4px rgba(0,0,0,0.03)',
            }}
            onMouseEnter={() => setHovered(topic.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              className="flex-shrink-0 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300"
              style={{
                width: 'clamp(22px, 5.5cqw, 28px)',
                height: 'clamp(22px, 5.5cqw, 28px)',
                fontSize: 'clamp(10px, 2.4cqw, 13px)',
                background: `linear-gradient(135deg, ${topic.color}, ${topic.color}dd)`,
                boxShadow: isHovered ? `0 0 10px ${topic.color}40` : 'none',
              }}
            >
              {topic.badge}
            </div>

            <span className={cn(
              'whitespace-nowrap transition-colors duration-300',
              isHovered ? 'text-[var(--ink)] font-medium' : 'text-[var(--ink)]/70',
            )}
            style={{ fontSize: 'clamp(10px, 2.2cqw, 13px)' }}>
              {topic.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
