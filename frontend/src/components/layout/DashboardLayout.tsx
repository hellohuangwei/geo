import { useState, useRef, useCallback, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { X } from 'lucide-react'

const MIN_WIDTH = 260
const MAX_WIDTH = 310
const DEFAULT_WIDTH = 270
const COLLAPSED_WIDTH = 60

export function DashboardLayout() {
  const location = useLocation()
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    setIsDragging(true)
    startX.current = e.clientX
    startWidth.current = collapsed ? MIN_WIDTH : sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    if (collapsed) setCollapsed(false)
  }, [collapsed, sidebarWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
      setSidebarWidth(next)
    }
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const onDoubleClick = useCallback(() => setCollapsed((prev) => !prev), [])
  const actualWidth = collapsed ? COLLAPSED_WIDTH : sidebarWidth

  // Close mobile sidebar and restore the top of the console on route change.
  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      {/* Skip to content */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--accent)] focus:text-white focus:rounded-[10px] focus:no-underline focus:font-semibold focus:text-[13px]">
        跳至主内容
      </a>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex shrink-0" style={{ width: `${actualWidth}px` }}>
        <div className="sticky top-0 h-screen overflow-y-auto" style={{ width: `${actualWidth}px` }}>
          <Sidebar
            collapsed={collapsed}
            width={actualWidth}
            isDragging={isDragging}
            onToggle={() => setCollapsed((p) => !p)}
          />
        </div>
      </div>

      {/* Desktop Resize handle */}
      {!collapsed && (
        <div
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
          className="hidden lg:flex relative z-50 flex-shrink-0 self-stretch cursor-col-resize items-center justify-center group"
          style={{ width: 10 }}
        >
          <div className="w-[3px] h-10 rounded-full bg-[var(--ink-3)]/20 group-hover:bg-[var(--accent)]/40 group-hover:h-16 transition-all duration-200" />
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 h-full w-[260px] bg-[var(--card)] shadow-2xl animate-in slide-in-from-left">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
              <span className="text-[15px] font-semibold">导航菜单</span>
              <button onClick={() => setMobileOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--fill-tertiary)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto h-[calc(100vh-56px)] py-4 px-3">
              <Sidebar collapsed={false} width={236} onToggle={() => {}} />
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main id="main-content" className="flex-1 min-w-0 px-6 pb-7 pt-5" aria-label="主内容">
        <div key={location.pathname} className="w-full animate-in-fast">
          <Header onMenuClick={() => setMobileOpen(true)} />
          <Outlet />
        </div>
      </main>
    </div>
  )
}
