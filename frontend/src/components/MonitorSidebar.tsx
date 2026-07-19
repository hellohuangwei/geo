import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ================================================================
   Shared right-sidebar widgets for monitor pages.
   Each monitor page defines its own quick-actions and insight,
   but the AI platform section is identical across all.
   ================================================================ */

interface QuickAction {
  icon: ReactNode
  label: string
  color: string
}

export function QuickActions({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions: QuickAction[]
}) {
  return (
    <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <div className="text-[11.5px] text-[var(--ink-3)] mb-4">{subtitle}</div>
      <div className="grid grid-cols-3 gap-2">
        {actions.map((a) => (
          <div
            key={a.label}
            className="flex flex-col items-center gap-1.5 cursor-pointer group py-2"
          >
            <div
              className="w-11 h-11 rounded-[12px] grid place-items-center group-hover:scale-105 transition-transform"
              style={{ background: `${a.color}12` }}
            >
              <span style={{ color: a.color }}>{a.icon}</span>
            </div>
            <span className="text-[10.5px] text-[var(--ink-2)] group-hover:text-[var(--ink)] transition-colors">
              {a.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface PlatformInfo {
  name: string
  color: string
  count?: number
  pos?: number
  neg?: number
}

export function PlatformAvatars({
  title,
  platforms,
  showBars = false,
  barData,
}: {
  title: string
  platforms: PlatformInfo[]
  showBars?: boolean
  barData?: PlatformInfo[]
}) {
  return (
    <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <span className="text-[var(--ink-3)] cursor-pointer text-[18px] leading-none">
          ⋮
        </span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {platforms.map((p) => (
          <div key={p.name} className="flex flex-col items-center gap-1">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
              style={{
                background: `linear-gradient(135deg, ${p.color}, ${p.color}dd)`,
              }}
            >
              {p.name.charAt(0)}
            </div>
            <span className="text-[9.5px] text-[var(--ink-3)]">{p.name}</span>
          </div>
        ))}
      </div>
      {showBars && barData && (
        <div className="mt-4 space-y-2">
          {barData.map((p) => (
            <div key={p.name} className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--ink-2)] w-14 shrink-0">
                {p.name}
              </span>
              <div className="h-[5px] rounded-[3px] bg-[var(--bg)] flex-1 overflow-hidden">
                <div
                  className="h-full rounded-[3px]"
                  style={{ width: `${p.count ?? 0}%`, background: p.color }}
                />
              </div>
              <span className="text-[10px] font-semibold text-[var(--ink-2)] num w-8 text-right">
                {p.count ?? 0}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function InsightCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center"
          style={{
            background:
              'linear-gradient(135deg, var(--accent), var(--accent-d))',
          }}
        >
          <svg
            className="w-4 h-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
      </div>
      <div className="text-[12.5px] text-[var(--ink-2)] leading-relaxed mt-2">
        {children}
      </div>
    </div>
  )
}

/** Common AI platform list — single source of truth */
export const AI_PLATFORMS: PlatformInfo[] = [
  { name: 'ChatGPT', color: 'var(--accent-d)' },
  { name: 'DeepSeek', color: 'var(--blue)' },
  { name: '豆包', color: 'var(--teal)' },
  { name: '千问', color: 'var(--orange)' },
  { name: 'Kimi', color: 'var(--purple)' },
  { name: '百度AI', color: 'var(--red)' },
]

/** Platform colors for site/avatar use */
export const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: 'var(--accent-d)',
  DeepSeek: 'var(--blue)',
  '豆包': 'var(--teal)',
  '通义千问': 'var(--orange)',
  '千问': 'var(--orange)',
  Kimi: 'var(--purple)',
  '百度AI': 'var(--red)',
}
