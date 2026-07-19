import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/api/client'
import { generateArticlesApi, generateSceneQuestionsApi } from '@/api/articles'
import { fetchTopicsApi, type TopicItem } from '@/api/topics'
import { fetchProductProfilesApi, type ProductProfile } from '@/api/productProfile'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/PageHeader'
import { ContentCard } from '@/components/ContentCard'
import { Sparkles, Loader2, Lightbulb, FileText, Hash, Package, MessageSquareText, Plus, X, HelpCircle, Wand2, ChevronDown, Check } from 'lucide-react'

const MAX_SCENE_QUESTIONS = 3

export function CreateArticlePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startTime = useRef(0)
  const [genQuestionsLoading, setGenQuestionsLoading] = useState(false)
  const [dbTopics, setDbTopics] = useState<TopicItem[]>([])
  const [dbProducts, setDbProducts] = useState<ProductProfile[]>([])
  const [pickOpen, setPickOpen] = useState(false)

  // 从数据库加载已启用的话题和产品
  useEffect(() => {
    fetchTopicsApi().then((list) => setDbTopics(list.filter((t) => t.enabled))).catch(() => {})
    fetchProductProfilesApi().then((list) => setDbProducts(list)).catch(() => {})
  }, [])

  // 点击外部关闭选择器
  useEffect(() => {
    if (!pickOpen) return
    const handler = (e: MouseEvent) => { if (!(e.target as Element).closest('.scene-picker')) setPickOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickOpen])

  useEffect(() => {
    if (!loading) return
    startTime.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [loading])

  const [form, setForm] = useState({
    topic: '',
    sceneQuestions: [''] as string[],
    product: '',
    articleCount: 3,
    notes: '',
  })

  // 所有场景问题 + 已选集合（依赖 form，必须在 form 之后）
  const allSceneQuestions = dbTopics.flatMap((t) =>
    (t.sceneQuestions || []).map((q) => ({ topicName: t.name, question: q })))
  const selectedSet = new Set(form.sceneQuestions.filter((q) => q.trim()))
  // 选择器展示的话题：如果已选话题则只展示该话题的，否则展示全部
  const pickerTopics = form.topic.trim()
    ? dbTopics.filter((t) => t.name === form.topic.trim() && (t.sceneQuestions || []).length > 0)
    : dbTopics.filter((t) => (t.sceneQuestions || []).length > 0)
  const pickerTotal = pickerTopics.reduce((sum, t) => sum + (t.sceneQuestions || []).length, 0)

  const update = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  /** 选择话题建议 — 同时填充话题和该话题的场景问题 */
  const selectTopic = (t: TopicItem) => {
    const qs = t.sceneQuestions && t.sceneQuestions.length > 0 ? t.sceneQuestions.slice(0, MAX_SCENE_QUESTIONS) : ['']
    setForm((prev) => ({ ...prev, topic: t.name, sceneQuestions: qs }))
  }

  /** 手动点击 AI 生成场景问题 */
  const handleAiGenQuestions = async () => {
    const topic = form.topic.trim()
    if (!topic) { toast.error('请先填写话题'); return }
    setGenQuestionsLoading(true)
    try {
      const questions = await generateSceneQuestionsApi(topic)
      if (!questions || questions.length === 0) {
        toast.error('AI 生成失败，请重试'); return
      }
      // 合并现有问题（去空）+ AI 生成的，上限20个
      const existing = form.sceneQuestions.filter((q) => q.trim())
      const merged = [...existing, ...questions.filter((q) => q.trim()
        && !existing.some((e) => e === q))]
      const capped = merged.slice(0, MAX_SCENE_QUESTIONS)
      setForm((prev) => ({ ...prev, sceneQuestions: capped.length > 0 ? capped : questions.slice(0, MAX_SCENE_QUESTIONS) }))
      if (merged.length > MAX_SCENE_QUESTIONS) {
        toast.success(`已生成，已截取前 ${MAX_SCENE_QUESTIONS} 个问题（上限）`)
      } else {
        toast.success(`AI 生成了 ${questions.length} 个场景问题`)
      }
    } catch {
      toast.error('AI 生成失败，请重试')
    } finally {
      setGenQuestionsLoading(false)
    }
  }

  const togglePickQuestion = (q: string) => {
    const current = form.sceneQuestions.filter((x) => x.trim())
    if (selectedSet.has(q)) {
      setForm((prev) => ({ ...prev, sceneQuestions: current.filter((x) => x !== q) }))
    } else {
      if (current.length >= MAX_SCENE_QUESTIONS) {
        toast.error(`最多选择 ${MAX_SCENE_QUESTIONS} 个场景问题`)
        return
      }
      setForm((prev) => ({ ...prev, sceneQuestions: [...current, q] }))
    }
  }

  const addSceneQuestion = () => {
    if (form.sceneQuestions.length >= MAX_SCENE_QUESTIONS) {
      toast.error(`场景问题最多 ${MAX_SCENE_QUESTIONS} 个`)
      return
    }
    setForm((prev) => ({ ...prev, sceneQuestions: [...prev.sceneQuestions, ''] }))
  }

  const removeSceneQuestion = (index: number) =>
    setForm((prev) => ({ ...prev, sceneQuestions: prev.sceneQuestions.filter((_, i) => i !== index) }))

  const updateSceneQuestion = (index: number, value: string) =>
    setForm((prev) => ({ ...prev, sceneQuestions: prev.sceneQuestions.map((q, i) => (i === index ? value : q)) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.topic.trim()) { toast.error('请填写话题'); return }
    if (form.sceneQuestions.length === 0 || form.sceneQuestions.every((q) => !q.trim())) {
      toast.error('请至少添加一个场景问题'); return
    }
    if (!form.product) { toast.error('请选择产品'); return }

    setLoading(true)
    try {
      const result = await generateArticlesApi({
        topic: form.topic.trim(),
        sceneQuestions: form.sceneQuestions.filter((q) => q.trim()),
        product: form.product,
        articleCount: form.articleCount,
        notes: form.notes.trim(),
      })
      toast.success(`成功生成 ${result.count} 篇文章`)
      navigate('/content/management')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '生成失败，请重试')
    } finally { setLoading(false) }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="创建优化文章" backTo="/content/management" />

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 话题 */}
          <Section>
            <div className="flex items-center gap-1.5 mb-4">
              <Lightbulb className="h-[18px] w-[18px] text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">话题</span>
              <span className="text-destructive text-xs">*</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/30 hover:text-muted-foreground/60 cursor-help transition-colors" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-[13px] leading-relaxed rounded-[12px]">
                  选择已有话题，话题和场景问题需要在话题设置中提前配置
                </TooltipContent>
              </Tooltip>
            </div>

            <Select value={form.topic} onValueChange={(v) => selectTopic(dbTopics.find(t => t.name === v)!)}
              disabled={dbTopics.length === 0}>
              <SelectTrigger className="h-10 rounded-[12px]" aria-required="true">
                <SelectValue placeholder={dbTopics.length === 0 ? '暂无话题，请先在话题设置中添加' : '请选择话题'} />
              </SelectTrigger>
              <SelectContent className="rounded-[12px]">
                {dbTopics.map((t) => (
                  <SelectItem key={t.id} value={t.name || ''}>
                    {t.name}
                    <span className="ml-2 text-[11px] text-[var(--ink-3)]/50">({t.sceneQuestions?.length || 0}个场景问题)</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Section>

          {/* 场景问题 */}
          <Section>
            <div className="flex items-center gap-1.5 mb-4">
              <MessageSquareText className="h-[18px] w-[18px] text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">场景问题</span>
              <span className="text-destructive text-xs">*</span>
              <span className="text-[11px] text-[var(--ink-3)]/50 ml-1">(最多{MAX_SCENE_QUESTIONS}个，已选{form.sceneQuestions.filter(q => q.trim()).length}个)</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/30 hover:text-muted-foreground/60 cursor-help transition-colors" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-[13px] leading-relaxed rounded-[12px]">
                  点击「从场景库选择」从已有场景问题中勾选，也可手动输入或 AI 生成。
                </TooltipContent>
              </Tooltip>
            </div>

            {/* 已选问题 */}
            <div className="space-y-2">
              {form.sceneQuestions.map((question, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{index + 1}.</span>
                  <Input value={question} onChange={(e) => updateSceneQuestion(index, e.target.value)}
                    placeholder="输入场景问题或从下方场景库选择"
                    className="h-10 rounded-[12px] flex-1" />
                  <Button type="button" variant="ghost" size="icon"
                    className="h-8 w-8 shrink-0 rounded-[12px] text-muted-foreground/40 hover:text-destructive transition-colors"
                    onClick={() => removeSceneQuestion(index)} disabled={form.sceneQuestions.length <= 1}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* 操作按钮行 */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Button type="button" variant="ghost" size="sm"
                className="h-9 gap-1.5 rounded-[12px] text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={addSceneQuestion}
                disabled={form.sceneQuestions.length >= MAX_SCENE_QUESTIONS}>
                <Plus className="h-4 w-4" /> 手动添加
              </Button>
              <span className="text-[11px] text-[var(--ink-3)]/40">|</span>
              <Button type="button" variant="ghost" size="sm"
                className="h-9 gap-1.5 rounded-[12px] text-sm font-medium text-[var(--accent)]/70 hover:text-[var(--accent)]"
                onClick={handleAiGenQuestions}
                disabled={genQuestionsLoading || form.sceneQuestions.length >= MAX_SCENE_QUESTIONS}>
                {genQuestionsLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> AI 生成中…</>
                ) : (
                  <><Wand2 className="h-4 w-4" /> AI 生成</>
                )}
              </Button>
              {form.topic.trim() && (
                <>
                  <span className="text-[11px] text-[var(--ink-3)]/40">|</span>
                  <div className="relative scene-picker">
                    <Button type="button" variant="ghost" size="sm"
                      className="h-9 gap-1.5 rounded-[12px] text-sm font-medium text-[var(--system-blue)]/80 hover:text-[var(--system-blue)]"
                      onClick={() => setPickOpen(!pickOpen)}
                      disabled={pickerTotal === 0 || form.sceneQuestions.length >= MAX_SCENE_QUESTIONS}>
                      <ChevronDown className={`h-4 w-4 transition-transform ${pickOpen ? 'rotate-180' : ''}`} />
                      从场景库选择 ({pickerTotal})
                    </Button>
                {pickOpen && (
                  <div className="absolute top-full left-0 mt-1 w-[calc(100vw-2rem)] max-w-[420px] max-h-[320px] overflow-y-auto rounded-[14px] border border-[var(--border)] bg-[var(--card)] shadow-[0_8px_30px_rgba(0,0,0,0.12)] z-50 p-2">
                    {/* 按话题分组，选中话题后只显示该话题的场景问题 */}
                    {pickerTopics.map((t) => (
                      <div key={t.id} className="mb-1 last:mb-0">
                        <div className="text-[11px] font-semibold text-[var(--ink-3)]/60 px-3 py-1.5 uppercase tracking-[0.04em]">{t.name}</div>
                        {(t.sceneQuestions || []).map((q) => {
                          const sel = selectedSet.has(q)
                          const atMax = !sel && form.sceneQuestions.filter(x => x.trim()).length >= MAX_SCENE_QUESTIONS
                          return (
                            <button key={q} type="button"
                              onClick={() => togglePickQuestion(q)}
                              disabled={atMax}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-left text-[13px] hover:bg-[var(--fill-tertiary)] transition-colors disabled:opacity-35">
                              <span className={`w-4 h-4 rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-[var(--system-blue)] border-[var(--system-blue)]' : 'border-[var(--border)]'}`}>
                                {sel && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                              </span>
                              <span className="truncate">{q}</span>
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
            )}
            </div>
          </Section>

          {/* 指定产品 */}
          <Section>
            <div className="flex items-center gap-1.5 mb-4">
              <Package className="h-[18px] w-[18px] text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">指定产品</span>
              <span className="text-destructive text-xs">*</span>
            </div>

            <Select value={form.product} onValueChange={(v) => update('product', v)}>
              <SelectTrigger className="h-10 rounded-[12px]" aria-required="true">
                <SelectValue placeholder="请选择产品" />
              </SelectTrigger>
              <SelectContent className="rounded-[12px]">
                {dbProducts.length === 0 ? (
                  <SelectItem value="" disabled>暂无产品，请先在产品画像中添加</SelectItem>
                ) : (
                  dbProducts.map((p) => (
                    <SelectItem key={p.id} value={p.productName || ''}>{p.productName || '未命名产品'}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Section>

          {/* 生成数量 + 附加说明 */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Section>
              <div className="flex items-center gap-1.5 mb-4">
                <Hash className="h-[18px] w-[18px] text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">生成数量</span>
              </div>

              <div className="flex items-center gap-3">
                <button type="button" onClick={() => update('articleCount', Math.max(1, form.articleCount - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors text-lg font-medium">
                  −
                </button>
                <Input type="number" min={1} max={20} value={form.articleCount}
                  onChange={(e) => update('articleCount', Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="h-10 w-20 text-center rounded-[12px] text-[15px] font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <button type="button" onClick={() => update('articleCount', Math.min(20, form.articleCount + 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors text-lg font-medium">
                  +
                </button>
                <span className="text-sm text-muted-foreground">篇</span>
              </div>
            </Section>

            <Section>
              <div className="flex items-center gap-1.5 mb-4">
                <FileText className="h-[18px] w-[18px] text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">附加说明</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/30 hover:text-muted-foreground/60 cursor-help transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[320px] text-[13px] leading-relaxed rounded-[12px]">
                    写作风格、关键词、目标受众等要求
                  </TooltipContent>
                </Tooltip>
              </div>

              <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={4}
                className="w-full resize-none rounded-[12px] border border-border/60 bg-transparent px-3.5 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-colors" />
            </Section>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => navigate('/content/management')}
              className="h-9 rounded-[12px] text-sm font-medium text-muted-foreground hover:text-foreground">取消</Button>
            <Button type="submit" disabled={loading} className="h-9 gap-2 rounded-[12px] text-sm font-medium">
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> 生成中 {elapsed}s…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> 开始生成</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </TooltipProvider>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <ContentCard padding="normal">{children}</ContentCard>
}
