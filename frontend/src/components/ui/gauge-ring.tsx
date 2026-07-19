import { useState, useEffect, useId } from 'react'

interface GaugeRingProps {
  /** 0–100 百分比值 */
  pct: number
  /** 圆环直径，默认 114 */
  size?: number
  /** 描边粗细，默认 5 */
  stroke?: number
  /** 轨道颜色，默认使用 CSS 变量 */
  trackColor?: string
  /** 渐变起始色，默认使用 CSS 变量 */
  startColor?: string
  /** 渐变结束色，默认使用 CSS 变量 */
  endColor?: string
  /** 动画持续时间 ms，默认 1000 */
  duration?: number
}

export function GaugeRing({
  pct,
  size = 114,
  stroke = 5,
  trackColor = 'var(--fill-tertiary)',
  startColor = 'var(--accent-l)',
  endColor = 'var(--accent-d)',
  duration = 1000,
}: GaugeRingProps) {
  const id = useId()
  const gradientId = `gauge-grad-${id.replace(/:/g, '')}`
  const r = size / 2 - stroke
  const circ = 2 * Math.PI * r
  const [offset, setOffset] = useState(circ)

  useEffect(() => {
    const timer = setTimeout(() => setOffset(circ * (1 - Math.min(pct, 100) / 100)), 250)
    return () => clearTimeout(timer)
  }, [circ, pct])

  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={startColor} />
          <stop offset="100%" stopColor={endColor} />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        strokeWidth={stroke}
        style={{ transition: `stroke-dashoffset ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)` }}
      />
    </svg>
  )
}
