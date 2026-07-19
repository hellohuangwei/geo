import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchProductProfileApi, updateProductProfileApi } from '@/api/productProfile'
import { ApiError } from '@/api/client'
import { ArrowLeft, Save, Loader2, Box, Award, Target, Users, Pencil } from 'lucide-react'
import { toast } from 'sonner'

const inputC = "w-full h-11 rounded-[12px] border border-[var(--separator)] bg-[var(--bg-secondary)] px-4 text-[15px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] focus:outline-none focus:border-[var(--system-blue)] focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-colors"
const taC = "w-full resize-y rounded-[12px] border border-[var(--separator)] bg-[var(--bg-secondary)] px-4 py-3 text-[15px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] leading-relaxed focus:outline-none focus:border-[var(--system-blue)] focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-colors"

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ productName: '', keyFeatures: '', advantages: '', applicableScenarios: '', caseStudies: '' })

  useEffect(() => {
    if (!id) return
    fetchProductProfileApi(Number(id))
      .then(p => setForm({ productName: p.productName || '', keyFeatures: p.keyFeatures || '', advantages: p.advantages || '', applicableScenarios: p.applicableScenarios || '', caseStudies: p.caseStudies || '' }))
      .catch(() => navigate('/settings/product-profile'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!id || !form.productName.trim()) { toast.error('请填写产品名称'); return }
    setSaving(true)
    try { await updateProductProfileApi(Number(id), form as Record<string, string>); toast.success('保存成功'); setEditing(false) }
    catch (err) { toast.error(err instanceof ApiError ? err.message : '保存失败') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-40"><Loader2 className="h-6 w-6 animate-spin text-[var(--label-tertiary)]" /></div>

  const backBtn = (
    <button onClick={() => navigate('/settings/product-profile')} className="h-9 w-9 flex items-center justify-center rounded-full text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">
      <ArrowLeft className="h-[18px] w-[18px]" />
    </button>
  )

  /* ===== View Mode ===== */
  if (!editing) {
    const hasContent = form.keyFeatures || form.advantages || form.caseStudies
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {backBtn}
            <div>
              <h1 className="text-[var(--text-title2)] font-bold text-[var(--label-primary)]">{form.productName || '未命名产品'}</h1>
              <p className="text-[var(--text-footnote)] text-[var(--label-secondary)] mt-0.5">产品画像</p>
            </div>
          </div>
          <button onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">
            <Pencil className="h-4 w-4" /> 编辑
          </button>
        </div>

        <div className="space-y-4">
          {/* 基本信息 — 两栏 */}
          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-[13px] font-medium text-[var(--label-secondary)] mb-2">产品名称</p>
                <p className="text-[17px] font-semibold text-[var(--label-primary)]">{form.productName || '—'}</p>
              </div>
              <div>
                <p className="text-[13px] font-medium text-[var(--label-secondary)] mb-2">适用场景</p>
                <p className="text-[15px] text-[var(--label-primary)]">{form.applicableScenarios || '—'}</p>
              </div>
            </div>
          </div>

          {/* 核心功能 + 产品优势 — 堆叠 */}
          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <div className="mx-auto max-w-3xl space-y-6">
              <div>
                <p className="text-[13px] font-medium text-[var(--label-secondary)] mb-2">核心功能</p>
                <p className="text-[15px] text-[var(--label-primary)] leading-[1.7] whitespace-pre-wrap">{form.keyFeatures || '—'}</p>
              </div>
              <div>
                <p className="text-[13px] font-medium text-[var(--label-secondary)] mb-2">产品优势</p>
                <p className="text-[15px] text-[var(--label-primary)] leading-[1.7] whitespace-pre-wrap">{form.advantages || '—'}</p>
              </div>
            </div>
          </div>

          {/* 合作案例 — 单独 */}
          <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
            <p className="text-[13px] font-medium text-[var(--label-secondary)] mb-2">合作案例</p>
            <p className="text-[15px] text-[var(--label-primary)] leading-[1.7] whitespace-pre-wrap">{form.caseStudies || '—'}</p>
          </div>
        </div>
      </div>
    )
  }

  /* ===== Edit Mode ===== */
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {backBtn}
          <div>
            <h1 className="text-[var(--text-title2)] font-bold text-[var(--label-primary)]">编辑产品画像</h1>
            <p className="text-[var(--text-footnote)] text-[var(--label-secondary)] mt-0.5">{form.productName}</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 h-10 px-6 rounded-full text-[14px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 disabled:opacity-50 active:scale-[0.97] transition-all shadow-none">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? '保存中…' : '保存'}
        </button>
      </div>

      <div className="space-y-4">
        <Section icon={Box} label="产品名称" required>
          <input value={form.productName} onChange={e => update('productName', e.target.value)} className={inputC} placeholder="产品的正式称谓" />
        </Section>
        <Section icon={Box} label="核心功能">
          <textarea value={form.keyFeatures} onChange={e => update('keyFeatures', e.target.value)} rows={5} className={taC} placeholder="产品为解决用户关键问题所提供的能力" />
        </Section>
        <Section icon={Award} label="产品优势">
          <textarea value={form.advantages} onChange={e => update('advantages', e.target.value)} rows={4} className={taC} placeholder="与竞争对手相比的独特长处" />
        </Section>
        <Section icon={Target} label="适用场景 / 行业 / 人群">
          <textarea value={form.applicableScenarios} onChange={e => update('applicableScenarios', e.target.value)} rows={4} className={taC} placeholder="产品使用的具体情境、领域、用户角色" />
        </Section>
        <Section icon={Users} label="合作案例">
          <textarea value={form.caseStudies} onChange={e => update('caseStudies', e.target.value)} rows={4} className={taC} placeholder="过往服务的代表性客户实例" />
        </Section>
      </div>
    </div>
  )
}

function Section({ icon: Icon, label, required, children }: { icon: React.ComponentType<{ className?: string }>; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--fill-quaternary)]"><Icon className="h-[14px] w-[14px] text-[var(--label-secondary)]" /></div>
        <span className="text-[var(--text-subhead)] font-medium text-[var(--label-primary)]">{label}</span>
        {required && <span className="text-[var(--system-red)] text-[13px]">*</span>}
      </div>
      {children}
    </div>
  )
}

function VF({ label, value, block }: { label: string; value?: string | null; block?: boolean }) {
  return (
    <div>
      <p className="text-[var(--text-caption1)] font-medium text-[var(--label-secondary)] mb-1.5">{label}</p>
      <p className={`text-[var(--text-subhead)] text-[var(--label-primary)] ${block ? 'leading-relaxed whitespace-pre-wrap' : ''}`}>
        {value || <span className="text-[var(--label-tertiary)]">—</span>}
      </p>
    </div>
  )
}
