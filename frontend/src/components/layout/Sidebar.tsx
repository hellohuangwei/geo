import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  BadgeCheck,
  BarChart3,
  Box,
  ChevronRight,
  ChevronsLeft,
  Database,
  Eye,
  FileText,
  Flame,
  Link2,
  Network,
  Send,
  Settings,
  Smile,
  Tags,
  Target,
  UserPlus,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/* ========== Types ========== */
interface SidebarProps { collapsed: boolean; width: number; isDragging?: boolean; onToggle: () => void }
interface MenuItem { to: string; label: string; badge?: number; icon: React.ElementType }
interface MenuGroup { key: string; label: string; icon: React.ElementType; items: MenuItem[] }

/* ========== Menu Data ========== */
const menuGroups: MenuGroup[] = [
  {
    key: 'ai-monitor', label: 'AI 监测', icon: BarChart3,
    items: [
      { to: '/monitor/brand-visibility', label: '品牌可见度', icon: Eye },
      { to: '/monitor/citation-analysis', label: '引用分析', badge: 3, icon: Link2 },
      { to: '/monitor/scene-questions', label: '竞品分析', icon: Network },
      { to: '/monitor/brand-sentiment', label: '品牌情感', icon: Smile },
      { to: '/monitor/hot-topics', label: '话题热度', icon: Flame },
    ],
  },
  {
    key: 'ai-content', label: 'AI 内容', icon: FileText,
    items: [
      { to: '/content/management', label: '内容管理', badge: 5, icon: FileText },
      { to: '/monitor/ai-snapshot', label: '智能分发', icon: Send },
    ],
  },
  {
    key: 'ai-acquisition', label: 'AI 获客', icon: UserPlus,
    items: [
      { to: '/acquisition/overview', label: '抖音获客', icon: Target },
    ],
  },
  {
    key: 'settings', label: '设置', icon: Settings,
    items: [
      { to: '/settings/brand-profile', label: '品牌', icon: BadgeCheck },
      { to: '/settings/product-profile', label: '产品', icon: Box },
      { to: '/settings/topics', label: '话题', icon: Tags },
      { to: '/knowledge-base', label: '知识库', icon: Database },
    ],
  },
]

/* ========== Brand Mark ========== */
function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0"
        style={{
          background: 'linear-gradient(135deg, var(--accent-l), var(--accent))',
          boxShadow: '0 2px 10px rgba(139,195,74,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}
      >
        <span className="text-white text-[14px] font-extrabold leading-none" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>G</span>
      </span>
      <span className="text-[22px] font-bold tracking-[-0.02em] text-[var(--ink)] select-none">
        GEO<span className="text-[var(--accent)] font-bold">.</span>
      </span>
    </div>
  )
}

/* ========== Navigation Item ========== */
function NavItem({ to, label, badge, icon: Icon, collapsed }: { to: string; label: string; badge?: number; icon: React.ElementType; collapsed: boolean }) {
  const location = useLocation()
  const active = location.pathname === to

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <NavLink to={to} className={({ isActive: a }) => cn('sidebar-item-collapsed', (a || active) && 'active')}>
            <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right" className="rounded-[10px] text-[11.5px] font-medium">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <NavLink to={to} end className={({ isActive: a }) => cn('sidebar-item', (a || active) && 'active')}>
      <Icon className="sidebar-sub-icon" strokeWidth={1.7} aria-hidden="true" />
      <span className="sidebar-item-name">{label}</span>
      {badge != null && <span className="sidebar-badge">{badge}</span>}
    </NavLink>
  )
}

/* ========== Sidebar ========== */
export function Sidebar({ collapsed, width, isDragging, onToggle }: SidebarProps) {
  const location = useLocation()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    'ai-monitor': true,
    'ai-content': true,
    'ai-acquisition': true,
    'settings': true,
  })

  return (
    <aside
      aria-label="主导航"
      className={cn(
        'sidebar-container h-screen select-none',
        'transition-[width]',
        isDragging ? 'duration-100' : 'duration-300',
      )}
      style={{ width: `${width}px`, willChange: isDragging ? 'width' : undefined }}
    >
      <TooltipProvider delayDuration={250}>

        {/* ==== Brand ==== */}
        {!collapsed && (
          <div className="sidebar-brand">
            <BrandMark />
          </div>
        )}
        {collapsed && (
          <div className="sidebar-brand-collapsed">
            <span
              className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--accent-l), var(--accent))',
                boxShadow: '0 2px 10px rgba(139,195,74,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              <span className="text-white text-[11px] font-extrabold leading-none">G</span>
            </span>
          </div>
        )}

        {/* ==== Navigation ==== */}
        <nav className="sidebar-menu flex-1 overflow-y-auto">

            {/* 菜单分组 */}
            {menuGroups.map((group, gi) => {
              const isOpen = collapsed ? true : expanded[group.key]
              return (
                <div key={group.key} className={cn(gi > 0 && 'mt-3')}>
                  {!collapsed && (
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [group.key]: !p[group.key] }))}
                      className="sidebar-group-header"
                      aria-expanded={isOpen}
                    >
                      <ChevronRight
                        className={cn('group-chevron h-[9px] w-[9px] shrink-0', isOpen && 'rotate-90')}
                        strokeWidth={2.5}
                      />
                      <group.icon className="h-[12px] w-[12px] shrink-0" strokeWidth={1.8} />
                      {group.label}
                    </button>
                  )}
                  {(collapsed || isOpen) && (
                    <div className={cn(collapsed ? 'flex flex-col gap-0.5 items-center py-1' : 'sidebar-sub')}>
                      {group.items.map((item) => (
                        <NavItem
                          key={item.to}
                          to={item.to}
                          label={item.label}
                          badge={item.badge}
                          icon={item.icon}
                          collapsed={collapsed}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* ==== Bottom ==== */}
          <div className="sidebar-footer shrink-0 pb-5 pt-4">
            {collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink to="/settings" className={({ isActive: a }) => cn('sidebar-item-collapsed', (a || location.pathname === '/settings') && 'active')}>
                      <Settings className="h-[18px] w-[18px]" strokeWidth={1.6} />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="rounded-[10px] text-[11.5px] font-medium">设置</TooltipContent>
                </Tooltip>
                <button onClick={onToggle} className="sidebar-item-collapsed" aria-label="展开侧栏">
                  <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <NavLink to="/settings" className={({ isActive: a }) => cn('sidebar-item sidebar-footer-link', (a || location.pathname === '/settings') && 'active')}>
                  <Settings className="h-[17px] w-[17px]" strokeWidth={1.7} />
                  设置
                </NavLink>
                <button onClick={onToggle} className="sidebar-collapse-btn" aria-label="收起侧栏">
                  <ChevronsLeft className="w-[17px] h-[17px]" strokeWidth={1.6} />
                  收起侧栏
                </button>
              </div>
            )}
          </div>
      </TooltipProvider>
    </aside>
  )
}
