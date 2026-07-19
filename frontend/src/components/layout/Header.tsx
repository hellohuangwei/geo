import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, User, Bell, Calendar, SlidersHorizontal, RefreshCw, Menu } from 'lucide-react'
import { SearchCommand } from '@/components/SearchCommand'
import { cn } from '@/lib/utils'

/* ========== 日期工具函数 ========== */
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}
function formatDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function today() {
  const t = new Date()
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }
}
const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

/* ========== 日历 Popover ========== */
function CalendarPopover({
  start, end, onSelect, onClose,
}: {
  start: string; end: string; onSelect: (start: string, end: string) => void; onClose: () => void
}) {
  const [viewYear, setViewYear] = useState(today().y)
  const [viewMonth, setViewMonth] = useState(today().m)
  const [picking, setPicking] = useState<'start' | 'end'>('start')
  const [tempStart, setTempStart] = useState(start)
  const [tempEnd, setTempEnd] = useState(end)
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const todayDate = today()

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11) }
    else setViewMonth(viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0) }
    else setViewMonth(viewMonth + 1)
  }

  const handleDateClick = (y: number, m: number, d: number) => {
    const dateStr = formatDate(y, m, d)
    if (picking === 'start') {
      setTempStart(dateStr)
      setTempEnd(dateStr)
      setPicking('end')
    } else {
      if (dateStr < tempStart) {
        setTempStart(dateStr)
        setTempEnd(tempStart)
      } else {
        setTempEnd(dateStr)
      }
      setPicking('start')
      onSelect(tempStart < dateStr ? tempStart : dateStr, dateStr > tempStart ? dateStr : tempStart)
    }
  }

  const isInRange = (y: number, m: number, d: number) => {
    const ds = formatDate(y, m, d)
    return ds >= tempStart && ds <= tempEnd
  }
  const isStart = (y: number, m: number, d: number) => formatDate(y, m, d) === tempStart
  const isEnd = (y: number, m: number, d: number) => formatDate(y, m, d) === tempEnd
  const isToday = (y: number, m: number, d: number) =>
    y === todayDate.y && m === todayDate.m && d === todayDate.d

  return (
    <div ref={ref} className="absolute top-full mt-1.5 left-0 z-50 rounded-[16px] bg-[var(--card)] border border-[var(--line)] shadow-[0_8px_24px_rgba(0,0,0,0.10)] overflow-hidden"
      style={{ minWidth: 'min(320px, calc(100vw - 2rem))' }}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="h-7 w-7 flex items-center justify-center rounded-[7px] hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4 text-[var(--ink-3)]" />
          </button>
          <span className="text-[13px] font-bold text-[var(--ink)]">{viewYear}年 {MONTHS[viewMonth]}</span>
          <button onClick={nextMonth} className="h-7 w-7 flex items-center justify-center rounded-[7px] hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
            <div key={d} className="h-8 flex items-center justify-center text-[10px] font-bold text-[var(--ink-3)] uppercase">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`empty-${i}`} className="h-9" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1
            const inRange = isInRange(viewYear, viewMonth, d)
            const startDay = isStart(viewYear, viewMonth, d)
            const endDay = isEnd(viewYear, viewMonth, d)
            const todayDay = isToday(viewYear, viewMonth, d)
            return (
              <button
                key={d}
                onClick={() => handleDateClick(viewYear, viewMonth, d)}
                className={cn(
                  'h-9 flex items-center justify-center text-[12px] font-medium rounded-[8px] transition-all duration-100 relative',
                  'hover:bg-[var(--accent-soft)] hover:text-[var(--accent-d)]',
                  inRange && 'bg-[var(--accent-soft)] text-[var(--accent-d)] rounded-none',
                  startDay && 'bg-[var(--accent)] text-white rounded-l-[8px] hover:bg-[var(--accent)] hover:text-white',
                  endDay && 'bg-[var(--accent)] text-white rounded-r-[8px] hover:bg-[var(--accent)] hover:text-white',
                  todayDay && !startDay && !endDay && 'text-[var(--accent-d)] font-bold',
                )}
              >
                {d}
              </button>
            )
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-[var(--ink-3)]">
            <Calendar className="h-3 w-3" />
            <span className="mono text-[var(--ink)] font-medium">{tempStart}</span>
            <span>—</span>
            <span className="mono text-[var(--ink)] font-medium">{tempEnd}</span>
          </div>
          <span className="text-[10px] text-[var(--ink-3)]">
            {picking === 'start' ? '点击选择起始日期' : '点击选择结束日期'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ========== Theme Toggle ========== */
function ThemeToggle() {
  const { toggle } = useThemeStore()
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'))
    update()
    // Listen for system preference changes and manual class toggles via toggle()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    return () => { mq.removeEventListener('change', update) }
  }, [])

  const handleToggle = () => {
    toggle()
    // Update state after the DOM class changes
    requestAnimationFrame(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
  }

  return (
    <button
      className="topbar-icon-btn text-[var(--ink-2)] hover:text-[var(--ink)]"
      onClick={handleToggle}
      aria-label={isDark ? '切换浅色模式' : '切换深色模式'}
    >
      <RefreshCw className="h-[18px] w-[18px]" />
    </button>
  )
}

/* ========== Header ========== */
export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const initials = (user?.realName || user?.username || 'U').slice(0, 2).toUpperCase()

  const todayDate = today()
  const defaultStart = new Date(); defaultStart.setDate(defaultStart.getDate() - 14)
  const [startDate, setStartDate] = useState(formatDate(defaultStart.getFullYear(), defaultStart.getMonth(), defaultStart.getDate()))
  const [endDate, setEndDate] = useState(formatDate(todayDate.y, todayDate.m, todayDate.d))
  const [calendarOpen, setCalendarOpen] = useState(false)

  const displayLabel = startDate === endDate ? startDate : `${startDate} — ${endDate}`

  return (
    <header className="mb-6 flex h-[46px] items-center gap-3">
      {/* 移动端菜单按钮 */}
      <button
        className="lg:hidden h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--fill-tertiary)] text-[var(--ink-2)] -ml-1"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* 搜索 — 支持 ⌘K 快捷键 */}
      <SearchCommand />

      <div className="flex-1" />

      {/* 平台筛选 */}
      <Button variant="ghost" size="sm" className="hidden h-[42px] gap-1.5 rounded-[12px] px-3 text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] lg:inline-flex">
        <SlidersHorizontal className="h-4 w-4" />全部平台<ChevronDown className="h-3 w-3 opacity-40" />
      </Button>

      {/* 日历选择器 */}
      <div className="relative hidden lg:block">
        <Button
          variant="ghost" size="sm"
          className="h-[42px] gap-1.5 rounded-[12px] px-3 text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)]"
          onClick={() => setCalendarOpen(!calendarOpen)}
        >
          <Calendar className="h-3.5 w-3.5 text-[var(--accent-d)]" />
          <span className="mono">{displayLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-40" />
        </Button>
        {calendarOpen && (
          <CalendarPopover
            start={startDate}
            end={endDate}
            onSelect={(s, e) => { setStartDate(s); setEndDate(e) }}
            onClose={() => setCalendarOpen(false)}
          />
        )}
      </div>

      {/* 主题切换 */}
      <ThemeToggle />

      {/* 通知 */}
      <button className="topbar-icon-btn text-[var(--ink-2)] hover:text-[var(--ink)]" aria-label="通知">
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.7} />
      </button>

      {/* 用户 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="topbar-acct cursor-pointer border-0">
            <div className="text-right">
              <div className="text-[12.5px] font-semibold text-[var(--ink)]">{user?.realName || user?.username || '用户'}</div>
              <div className="text-[11px] text-[var(--ink-3)]">{user?.role || '管理员'}</div>
            </div>
            <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-[12px] font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--accent-d), var(--system-green))' }}>
              {initials}
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-[14px] bg-[var(--card)] border-[var(--line)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="px-3 py-2.5">
            <p className="text-sm font-semibold">{user?.realName || user?.username}</p>
            <p className="text-xs text-muted-foreground">{user?.role || '管理员'}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <User className="mr-2 h-4 w-4" />个人设置
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { logout(); navigate('/login') }} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
