import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  fetchProductProfilesApi,
  createProductProfileApi,
  updateProductProfileApi,
  deleteProductProfileApi,
  type ProductProfile,
} from '@/api/productProfile'
import { ApiError } from '@/api/client'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Save, Loader2, Plus, Pencil, HelpCircle, Sparkles, Trash2, Box } from 'lucide-react'

interface FormData {
  productName: string
  keyFeatures: string
  advantages: string
  applicableScenarios: string
  caseStudies: string
}

const emptyForm: FormData = { productName: '', keyFeatures: '', advantages: '', applicableScenarios: '', caseStudies: '' }

const hints: Record<keyof FormData, string> = {
  productName: '产品的正式称谓，也是 AI 内容生成时重点提及的产品词',
  keyFeatures: '产品为解决用户关键问题所提供的能力，列举核心功能点',
  advantages: '与竞争对手或旧方式相比，产品所具有的独特长处和吸引力',
  applicableScenarios: '产品使用的具体情境、领域、用户角色或客户类型',
  caseStudies: '过往服务的、具有代表性的客户实例，体现产品实际价值',
}

const inputClass = "w-full h-11 rounded-[12px] border border-[var(--separator)] bg-[var(--bg-secondary)] px-4 text-[15px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] focus:outline-none focus:border-[var(--system-blue)] focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-colors"
const textareaClass = "w-full resize-none rounded-[12px] border border-[var(--separator)] bg-[var(--bg-secondary)] px-4 py-3 text-[15px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] focus:outline-none focus:border-[var(--system-blue)] focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-colors leading-relaxed"

export function ProductProfilePage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductProfile | null>(null)

  useEffect(() => { loadProducts() }, [])

  const loadProducts = async () => {
    setLoading(true)
    try { setProducts(await fetchProductProfilesApi()) }
    catch { setProducts([]) }
    finally { setLoading(false) }
  }

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true) }
  const openEdit = (p: ProductProfile) => {
    setEditingId(p.id)
    setForm({ productName: p.productName || '', keyFeatures: p.keyFeatures || '', advantages: p.advantages || '', applicableScenarios: p.applicableScenarios || '', caseStudies: p.caseStudies || '' })
    setDialogOpen(true)
  }

  const update = (key: keyof FormData, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.productName.trim()) { toast.error('请填写产品名称'); return }
    setSaving(true)
    try {
      if (editingId !== null) {
        await updateProductProfileApi(editingId, form as unknown as Record<string, string>)
        toast.success('产品画像已更新')
      } else {
        await createProductProfileApi(form as unknown as Record<string, string>)
        toast.success('产品画像已创建')
      }
      setDialogOpen(false)
      await loadProducts()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : '保存失败') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try { await deleteProductProfileApi(deleteTarget.id); setDeleteTarget(null); toast.success('已删除'); await loadProducts() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : '删除失败') }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--label-tertiary)]" />
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      {/* ===== Empty State ===== */}
      {products.length === 0 ? (
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="text-center space-y-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--fill-quaternary)] mx-auto">
              <Box className="h-8 w-8 text-[var(--label-tertiary)]" />
            </div>
            <div className="space-y-2">
              <p className="text-[var(--text-title3)] font-semibold text-[var(--label-primary)]">还没有产品画像</p>
              <p className="text-[var(--text-footnote)] text-[var(--label-secondary)]">添加产品信息后，AI 将基于产品特性生成更精准的内容</p>
            </div>
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-full text-[15px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 active:scale-[0.97] transition-all shadow-none">
              <Plus className="h-[18px] w-[18px]" /> 创建产品画像
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-[1440px] space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[var(--text-title2)] font-bold text-[var(--label-primary)]">产品画像</h1>
              <p className="text-[var(--text-footnote)] text-[var(--label-secondary)] mt-1">{products.length} 个产品</p>
            </div>
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-[14px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 active:scale-[0.97] transition-all shadow-none">
              <Plus className="h-[18px] w-[18px]" /> 新建产品
            </button>
          </div>

          {/* Product Grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map(p => (
              <div key={p.id}
                className="group cursor-pointer rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-4 flex flex-col min-h-[240px]
                  hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200"
                onClick={() => navigate(`/settings/product-profile/${p.id}`)}
              >
                <h2 className="text-[var(--text-headline)] font-semibold text-[var(--label-primary)] truncate leading-snug">
                  {p.productName || '未命名产品'}
                </h2>
                <p className="text-[var(--text-caption1)] text-[var(--label-tertiary)] truncate mt-1.5 mb-3 h-[18px]">
                  {p.applicableScenarios || '暂无场景'}
                </p>
                <p className="text-[var(--text-footnote)] text-[var(--label-secondary)] leading-relaxed line-clamp-3 flex-1">
                  {p.keyFeatures || p.advantages || '暂无描述'}
                </p>
                <div className="flex items-center justify-between pt-4 border-t border-[var(--separator)] mt-auto">
                  <span className="text-[var(--text-caption2)] text-[var(--label-tertiary)] tracking-[0.04em] uppercase">
                    {p.createTime?.substring(0, 10) || ''}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(p)}
                      className="h-8 w-8 flex items-center justify-center rounded-[10px] text-[var(--label-tertiary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteTarget(p)}
                      className="h-8 w-8 flex items-center justify-center rounded-[10px] text-[var(--label-tertiary)] hover:text-[var(--system-red)] hover:bg-[var(--system-red)]/8 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Create/Edit Dialog ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-[20px] gap-0 p-6 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="space-y-1.5 mb-1">
            <DialogTitle className="text-[var(--text-headline)] font-semibold">
              {editingId !== null ? '编辑产品画像' : '新建产品画像'}
            </DialogTitle>
            <DialogDescription className="text-[var(--text-footnote)] text-[var(--label-secondary)] leading-normal">
              {editingId !== null ? '修改产品信息后保存即可生效' : '填写产品基本信息，帮助 AI 生成更精准的内容'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <Field label="产品名称" hint={hints.productName} required>
              <Input className={inputClass} value={form.productName} onChange={e => update('productName', e.target.value)} />
            </Field>
            <Field label="核心功能" hint={hints.keyFeatures}>
              <textarea value={form.keyFeatures} onChange={e => update('keyFeatures', e.target.value)} rows={3}
                className={textareaClass} />
            </Field>
            <Field label="产品优势" hint={hints.advantages}>
              <textarea value={form.advantages} onChange={e => update('advantages', e.target.value)} rows={3}
                className={textareaClass} />
            </Field>
            <Field label="适用场景/行业/人群" hint={hints.applicableScenarios}>
              <textarea value={form.applicableScenarios} onChange={e => update('applicableScenarios', e.target.value)} rows={3}
                className={textareaClass} />
            </Field>
            <Field label="合作案例" hint={hints.caseStudies}>
              <textarea value={form.caseStudies} onChange={e => update('caseStudies', e.target.value)} rows={3}
                className={textareaClass} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDialogOpen(false)}
                className="h-10 px-5 rounded-full text-[14px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">取消</button>
              <button type="submit" disabled={saving}
                className="inline-flex items-center gap-2 h-10 px-6 rounded-full text-[14px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 disabled:opacity-50 active:scale-[0.97] transition-all shadow-none">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Delete Dialog ===== */}
      <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="rounded-[20px] gap-0 p-6">
          <DialogHeader className="space-y-2.5">
            <DialogTitle className="flex items-center gap-2.5 text-[var(--text-headline)] font-semibold text-[var(--label-primary)]">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--system-red)]/10">
                <Trash2 className="h-4 w-4 text-[var(--system-red)]" />
              </div>
              删除产品画像
            </DialogTitle>
            <p className="text-[var(--text-footnote)] text-[var(--label-secondary)]">{deleteTarget?.productName || '未命名'}</p>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setDeleteTarget(null)}
              className="h-10 px-5 rounded-full text-[14px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">取消</button>
            <button onClick={handleDelete}
              className="h-10 px-5 rounded-full text-[14px] font-semibold text-white bg-[var(--system-red)] hover:bg-[var(--system-red)]/90 active:scale-[0.97] transition-all shadow-none">删除</button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

function Field({ label, hint, required, children }: { label: string; hint: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[var(--text-subhead)] font-medium text-[var(--label-primary)]">{label}</span>
        {required && <span className="text-[var(--system-red)] text-[13px]">*</span>}
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3.5 w-3.5 text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] cursor-help transition-colors" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[320px] text-[var(--text-footnote)] leading-relaxed rounded-[12px]">{hint}</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </div>
  )
}
