import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/client'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff } from 'lucide-react'

const REMEMBER_KEY = 'geo-remembered-user'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const navigate = useNavigate()

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) {
        const { username: u, password: p } = JSON.parse(saved)
        if (u) { setUsername(u); setPassword(p || ''); setRemember(true) }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const u = username.trim(); const p = password.trim()
    if (!u || !p) { toast.error('请输入用户名和密码'); return }
    setLoading(true)
    try {
      await login(u, p)
      if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: u, password: p }))
      else localStorage.removeItem(REMEMBER_KEY)
      toast.success('登录成功'); navigate('/dashboard')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '登录失败，请重试')
    } finally { setLoading(false) }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="relative z-10 w-full max-w-[420px] mx-auto px-6 py-12">
        {/* 品牌头 */}
        <div className="text-center mb-8">
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[var(--ink)]">登录</h1>
        </div>

        {/* 表单卡片 — 纯色，无glassmorphism */}
        <div className="rounded-[20px] p-8 bg-[var(--card)] border border-[var(--line)] shadow-[var(--shadow-card)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="用户名">
              <input
                type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                className="w-full h-11 rounded-[12px] border border-[var(--line)] px-4 text-[15px] outline-none transition-all duration-200 bg-[var(--bg)] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-[var(--accent)] focus:shadow-[var(--shadow-focus)] focus:bg-[var(--card)]"
                autoComplete="username" disabled={loading} placeholder="输入您的用户名"
              />
            </Field>

            <Field label="密码">
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 rounded-[12px] border border-[var(--line)] px-4 pr-10 text-[15px] outline-none transition-all duration-200 bg-[var(--bg)] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-[var(--accent)] focus:shadow-[var(--shadow-focus)] focus:bg-[var(--card)]"
                  autoComplete="current-password" disabled={loading} placeholder="输入您的密码"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--ink-3)]/40 hover:text-[var(--ink-2)] transition-colors" tabIndex={-1}>
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <span className={`w-[18px] h-[18px] rounded-[4px] border shrink-0 transition-all duration-200 flex items-center justify-center ${remember ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--ink-3)]/20 hover:border-[var(--ink-3)]/40'}`}>
                  {remember && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 5l2 2 4-4" />
                    </svg>
                  )}
                </span>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="sr-only" tabIndex={-1} />
                <span className="text-[13px] text-[var(--ink-2)]">记住密码</span>
              </label>
            </div>

            <button type="submit" disabled={loading}
              className="w-full h-11 rounded-[12px] text-[16px] font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-d))' }}
            >
              {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />登录中...</span> : '登录'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium mb-2 ml-0.5 text-[var(--ink)]">{label}</label>
      {children}
    </div>
  )
}
