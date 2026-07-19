import { cn } from '@/lib/utils'

interface ContentCardProps {
  children: React.ReactNode
  className?: string
  /** 内边距：none=无, normal=p-6, large=p-8 */
  padding?: 'none' | 'normal' | 'large'
}

/**
 * 统一的内容卡片容器
 * - 圆角：--radius-card (20px)
 * - 背景：--card，边框：border-border/50
 * - 阴影：--shadow-card，hover 微升
 */
export function ContentCard({ children, className, padding = 'none' }: ContentCardProps) {
  return (
    <div className={cn('content-card', className)}>
      {padding !== 'none' && (
        <div className={padding === 'large' ? 'p-8' : 'p-6'}>
          {children}
        </div>
      )}
      {padding === 'none' && children}
    </div>
  )
}
