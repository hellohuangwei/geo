import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { registerApi } from '@/api/auth'
import { Loader2, Eye, EyeOff } from 'lucide-react'

/* ========== 背景装饰 — 安静光斑 ========== */
function BackgroundDecor() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full blur-[120px] opacity-[0.10]"
        style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }} />
      <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] rounded-full blur-[100px] opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, var(--ink-3) 0%, transparent 70%)' }} />
    </div>
  )
}

export function RegisterPage() {
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', realName: '', phone: '', email: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const navigate = useNavigate()

  useEffect(() => { if (isAuthenticated) navigate('/dashboard', { replace: true }) }, [isAuthenticated, navigate])

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username.trim() || !form.password.trim()) { toast.error('请至少填写用户名和密码'); return }
    if (form.username.trim().length < 3) { toast.error('用户名至少需要3个字符'); return }
    if (form.password.length < 6) { toast.error('密码至少需要6个字符'); return }
    if (form.password !== form.confirmPassword) { toast.error('两次输入的密码不一致'); return }
    if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone)) { toast.error('手机号格式不正确'); return }
    setLoading(true)
    try {
      await registerApi({
        username: form.username.trim(),
        password: form.password,
        realName: form.realName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      })
      toast.success('注册成功，请登录')
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '注册失败，请重试')
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <BackgroundDecor />

      <div className="w-full max-w-[460px] animate-scale-in">
        {/* 表单卡片 */}
        <div className="soft-card p-8">
          <h2 className="text-[28px] font-bold tracking-[-0.3px] text-foreground mb-8" style={{ fontFamily: 'Poppins, sans-serif' }}>注册</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 用户名 + 姓名 */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                  用户名 <span className="text-destructive">*</span>
                </label>
                <Input placeholder="至少3个字符" value={form.username} onChange={(e) => update('username', e.target.value)}
                  className="h-11 rounded-[12px] text-[15px]" disabled={loading} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">姓名</label>
                <Input placeholder="真实姓名" value={form.realName} onChange={(e) => update('realName', e.target.value)}
                  className="h-11 rounded-[12px] text-[15px]" disabled={loading} />
              </div>
            </div>

            {/* 密码 */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                密码 <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Input type={showPwd ? 'text' : 'password'} placeholder="至少6个字符" value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  className="h-11 pr-10 rounded-[12px] text-[15px]" disabled={loading} />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors" tabIndex={-1}>
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 确认密码 */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                确认密码 <span className="text-destructive">*</span>
              </label>
              <Input type="password" placeholder="再次输入密码" value={form.confirmPassword}
                onChange={(e) => update('confirmPassword', e.target.value)}
                className="h-11 rounded-[12px] text-[15px]" disabled={loading} />
            </div>

            {/* 手机号 + 邮箱 */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">手机号</label>
                <Input placeholder="11位手机号" value={form.phone} onChange={(e) => update('phone', e.target.value)}
                  className="h-11 rounded-[12px] text-[15px]" disabled={loading} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">邮箱</label>
                <Input type="email" placeholder="example@mail.com" value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  className="h-11 rounded-[12px] text-[15px]" disabled={loading} />
              </div>
            </div>

            {/* 注册按钮 */}
            <Button type="submit" className="h-11 w-full text-[16px] font-semibold rounded-[12px] tracking-[-0.02em]" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />注册中...</> : '注册'}
            </Button>
          </form>
        </div>

        {/* 底部链接 */}
        <p className="mt-6 text-center text-[15px] text-muted-foreground">
          已有账号？
          <Link to="/login" className="ml-1 font-medium text-primary hover:text-primary/80 transition-colors">
            立即登录
          </Link>
        </p>

      </div>
    </div>
  )
}
