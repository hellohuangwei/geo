import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  backTo?: string
  actions?: React.ReactNode
}

/**
 * 统一的页面标题组件
 * - 标题：24px bold Poppins（复用 page-title CSS class）
 * - 返回按钮：统一 8×8 rounded-lg ghost icon
 * - 操作区：右侧插槽
 */
export function PageHeader({ title, description, backTo, actions }: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 min-w-0">
        {backTo && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => navigate(backTo)}
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-desc">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
