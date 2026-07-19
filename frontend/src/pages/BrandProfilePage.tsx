import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchBrandProfileApi, updateBrandProfileApi, deleteBrandProfileApi, type BrandProfile } from '@/api/brandProfile'
import { ApiError } from '@/api/client'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Save, Loader2, Plus, Pencil, HelpCircle, Building2, Trash2 } from 'lucide-react'
import provincesData from 'china-division/dist/provinces.json'
import citiesData from 'china-division/dist/cities.json'

interface FormData { brandName: string; brandAliases: string; industry: string; serviceArea: string; description: string; targetCustomers: string; qualifications: string; painPoints: string; website: string; competitors: string }
const emptyForm: FormData = { brandName: '', brandAliases: '', industry: '', serviceArea: '', description: '', targetCustomers: '', qualifications: '', painPoints: '', website: '', competitors: '' }
interface Province { code: string; name: string }
interface City { code: string; name: string; provinceCode: string }
const provinces: Province[] = [{ code: '', name: '全国' }, ...(provincesData as Province[])]
const cities: City[] = citiesData as City[]

const hints: Record<keyof FormData, string> = {
  brandName: '在 AI 平台中推荐的主要品牌词，也是 AI 提及识别时的核心关键词',
  brandAliases: '其他能代表品牌的名称，当 AI 推荐了别称也代表提及了当前品牌，多个用逗号分隔',
  industry: '品牌所属行业，例如：SaaS / 零售 / 企业服务',
  serviceArea: '品牌提供产品或服务的区域，如仅在部分区域提供服务则需填写',
  description: '简要介绍品牌的核心业务、市场定位和独特优势',
  targetCustomers: '描述核心目标客户群体的特征，如企业规模、行业、营收范围、关键需求等',
  qualifications: '品牌获得的资质认证、荣誉奖项等',
  painPoints: '所处行业普遍存在的痛点以及目标客户面临的具体问题',
  website: '品牌官方网站地址',
  competitors: '市场上的主要竞争对手，逗号分隔',
}

type PageState = 'loading' | 'empty' | 'view' | 'editing'
const inputC = "h-11 rounded-[12px] border border-[var(--separator)] bg-[var(--bg-secondary)] px-4 text-[15px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] focus:outline-none focus:border-[var(--system-blue)] focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-colors"
const taC = "w-full resize-none rounded-[12px] border border-[var(--separator)] bg-[var(--bg-secondary)] px-4 py-3 text-[15px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] leading-relaxed focus:outline-none focus:border-[var(--system-blue)] focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-colors"

export function BrandProfilePage() {
  const location = useLocation()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [profile, setProfile] = useState<BrandProfile | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => { loadProfile() }, [])

  // Ctrl+S 快捷键保存
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && pageState === 'editing') {
        e.preventDefault()
        if (!form.brandName.trim()) { toast.error('请填写品牌名称'); return }
        setSaving(true)
        updateBrandProfileApi(form as unknown as Record<string, string>)
          .then(u => { setProfile(u); toast.success('品牌信息保存成功'); setPageState('view') })
          .catch(err => toast.error(err instanceof ApiError ? err.message : '保存失败'))
          .finally(() => setSaving(false))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pageState, form])

  const loadProfile = async () => {
    setPageState('loading')
    try {
      const data = await fetchBrandProfileApi()
      if (data) {
        setProfile(data); setForm({ brandName: data.brandName || '', brandAliases: data.brandAliases || '', industry: data.industry || '', serviceArea: data.serviceArea || '', description: data.description || '', targetCustomers: data.targetCustomers || '', qualifications: data.qualifications || '', painPoints: data.painPoints || '', website: data.website || '', competitors: data.competitors || '' })
        setPageState((location.state as any)?.edit ? 'editing' : 'view')
      } else { setProfile(null); setForm(emptyForm); setPageState('empty') }
    } catch { setProfile(null); setForm(emptyForm); setPageState('empty') }
  }

  const update = (key: keyof FormData, value: string) => setForm(prev => ({ ...prev, [key]: value }))
  const handleDelete = async () => { setDeleteOpen(false); try { await deleteBrandProfileApi(); setProfile(null); setForm(emptyForm); setPageState('empty'); toast.success('品牌信息已删除') } catch (err) { toast.error(err instanceof ApiError ? err.message : '删除失败') } }
  const handleCancel = () => {
    if (profile) setForm({ brandName: profile.brandName || '', brandAliases: profile.brandAliases || '', industry: profile.industry || '', serviceArea: profile.serviceArea || '', description: profile.description || '', targetCustomers: profile.targetCustomers || '', qualifications: profile.qualifications || '', painPoints: profile.painPoints || '', website: profile.website || '', competitors: profile.competitors || '' })
    setPageState(profile ? 'view' : 'empty')
  }
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.brandName.trim()) { toast.error('请填写品牌名称'); return }
    setSaving(true)
    try { const u = await updateBrandProfileApi(form as unknown as Record<string, string>); setProfile(u); toast.success('品牌信息保存成功'); setPageState('view') }
    catch (err) { toast.error(err instanceof ApiError ? err.message : '保存失败') }
    finally { setSaving(false) }
  }

  if (pageState === 'loading') return <div className="flex items-center justify-center py-40"><Loader2 className="h-6 w-6 animate-spin text-[var(--label-tertiary)]" /></div>

  /* ===== Empty ===== */
  if (pageState === 'empty') {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--fill-quaternary)] mx-auto">
            <Building2 className="h-8 w-8 text-[var(--label-tertiary)]" />
          </div>
          <div className="space-y-2">
            <p className="text-[var(--text-title3)] font-semibold text-[var(--label-primary)]">还没有品牌</p>
            <p className="text-[var(--text-footnote)] text-[var(--label-secondary)]">填写品牌信息后，AI 将基于品牌背景生成更精准的内容</p>
          </div>
          <button onClick={() => setPageState('editing')}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full text-[15px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 active:scale-[0.97] transition-all shadow-none">
            <Plus className="h-[18px] w-[18px]" /> 创建品牌
          </button>
        </div>
      </div>
    )
  }

  /* ===== View ===== */
  if (pageState === 'view') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[var(--text-title2)] font-bold text-[var(--label-primary)]">{form.brandName || '未命名'}</h1>
            <p className="text-[var(--text-footnote)] text-[var(--label-secondary)] mt-0.5">品牌信息概览</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPageState('editing')}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">
              <Pencil className="h-4 w-4" /> 编辑
            </button>
            <button onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium text-[var(--label-secondary)] hover:text-[var(--system-red)] hover:bg-[var(--system-red)]/8 transition-colors">
              <Trash2 className="h-4 w-4" /> 删除
            </button>
          </div>
        </div>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="rounded-[20px] gap-0 p-6">
            <DialogHeader className="space-y-2.5">
              <DialogTitle className="flex items-center gap-2.5 text-[var(--text-headline)] font-semibold">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--system-red)]/10"><Trash2 className="h-4 w-4 text-[var(--system-red)]" /></div>
                删除品牌信息
              </DialogTitle>
              <p className="text-[var(--text-footnote)] text-[var(--label-secondary)]">{form.brandName || '未命名'}</p>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setDeleteOpen(false)} className="h-10 px-5 rounded-full text-[14px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">取消</button>
              <button onClick={handleDelete} className="h-10 px-5 rounded-full text-[14px] font-semibold text-white bg-[var(--system-red)] hover:bg-[var(--system-red)]/90 active:scale-[0.97] transition-all shadow-none">删除</button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-4">
          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <VF label="品牌名称" value={form.brandName} /><VF label="品牌别称" value={form.brandAliases} />
              <VF label="行业" value={form.industry} /><VF label="服务区域" value={form.serviceArea} />
            </div>
          </div>
          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <div className="mx-auto max-w-3xl space-y-6">
              <VF label="品牌简介" value={form.description} block /><VF label="目标客户特征" value={form.targetCustomers} block />
              <VF label="资质 / 奖项" value={form.qualifications} block /><VF label="行业和客户痛点" value={form.painPoints} block />
            </div>
          </div>
          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <VF label="品牌官网" value={form.website} /><VF label="竞争对手" value={form.competitors} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ===== Editing ===== */
  return (
    <TooltipProvider delayDuration={300}>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-[var(--text-title2)] font-bold text-[var(--label-primary)]">{profile ? '编辑品牌' : '创建品牌'}</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="品牌名称" hint={hints.brandName} required><input className={inputC} value={form.brandName} onChange={e => update('brandName', e.target.value)} aria-required="true" aria-invalid={!form.brandName.trim() ? true : undefined} /></Field></div>
              <Field label="品牌别称" hint={hints.brandAliases}><input className={inputC} value={form.brandAliases} onChange={e => update('brandAliases', e.target.value)} /></Field>
              <Field label="行业" hint={hints.industry}><input className={inputC} value={form.industry} onChange={e => update('industry', e.target.value)} /></Field>
              <Field label="服务区域" hint={hints.serviceArea}>
                <ServiceAreaSelect value={form.serviceArea} onChange={v => update('serviceArea', v)} cities={cities} provinces={provinces} />
              </Field>
            </div>
          </div>

          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <div className="mx-auto max-w-3xl space-y-6">
              <Field label="品牌简介" hint={hints.description}><textarea value={form.description} onChange={e => update('description', e.target.value)} rows={4} className={taC} /></Field>
              <Field label="目标客户特征" hint={hints.targetCustomers}><textarea value={form.targetCustomers} onChange={e => update('targetCustomers', e.target.value)} rows={3} className={taC} /></Field>
              <Field label="资质 / 奖项" hint={hints.qualifications}><textarea value={form.qualifications} onChange={e => update('qualifications', e.target.value)} rows={3} className={taC} /></Field>
              <Field label="行业和客户痛点" hint={hints.painPoints}><textarea value={form.painPoints} onChange={e => update('painPoints', e.target.value)} rows={3} className={taC} /></Field>
            </div>
          </div>

          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="品牌官网" hint={hints.website}><input className={inputC} value={form.website} onChange={e => update('website', e.target.value)} /></Field>
              <Field label="竞争对手" hint={hints.competitors}><input className={inputC} value={form.competitors} onChange={e => update('competitors', e.target.value)} /></Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleCancel} className="h-10 px-5 rounded-full text-[14px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">取消</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 h-10 px-6 rounded-full text-[14px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 disabled:opacity-50 active:scale-[0.97] transition-all shadow-none">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </TooltipProvider>
  )
}

/* ===== Sub-components ===== */
function Field({ label, hint, required, children }: { label: string; hint: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[var(--text-subhead)] font-medium text-[var(--label-primary)]">{label}</span>
        {required && <span className="text-[var(--system-red)] text-[13px]">*</span>}
        <Tooltip>
          <TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] cursor-help transition-colors" /></TooltipTrigger>
          <TooltipContent side="top" className="max-w-[320px] text-[var(--text-footnote)] leading-relaxed rounded-[12px]">{hint}</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </div>
  )
}

function ServiceAreaSelect({ value, onChange, cities, provinces }: { value: string; onChange: (v: string) => void; cities: City[]; provinces: Province[] }) {
  const parts = value ? value.split(' ') : ['', '']
  const sp = parts[0] || ''; const sc = parts[1] || ''
  const fc = useMemo(() => sp ? cities.filter(c => { const p = provinces.find(p => p.name === sp); return p && c.provinceCode === p.code }) : [], [sp, cities, provinces])
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Select value={sp} onValueChange={v => onChange(v === '全国' ? '全国' : `${v}`)}>
        <SelectTrigger className="h-11 rounded-[12px] border-[var(--separator)] bg-[var(--bg-secondary)]"><SelectValue placeholder="省份 / 区域" /></SelectTrigger>
        <SelectContent className="rounded-[12px] max-h-60">{provinces.map(p => <SelectItem key={p.code || 'all'} value={p.name}>{p.name}</SelectItem>)}</SelectContent>
      </Select>
      {sp && sp !== '全国' && (
        <Select value={sc} onValueChange={v => onChange(`${sp} ${v}`)}>
          <SelectTrigger className="h-11 rounded-[12px] border-[var(--separator)] bg-[var(--bg-secondary)]"><SelectValue placeholder="城市" /></SelectTrigger>
          <SelectContent className="rounded-[12px] max-h-60">{fc.map(c => <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  )
}

function VF({ label, value, block }: { label: string; value?: string | null; block?: boolean }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-[var(--label-secondary)] mb-2">{label}</p>
      <p className={`text-[15px] text-[var(--label-primary)] ${block ? 'leading-[1.7] whitespace-pre-wrap' : ''}`}>
        {value || <span className="text-[var(--label-tertiary)]">—</span>}
      </p>
    </div>
  )
}
