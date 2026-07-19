import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, Plus, Pencil, Check, Hash, MessageSquare, ChevronRight, ArrowLeft, Trash2, Wand2 } from 'lucide-react'
import { fetchTopicsApi, createTopicApi, updateTopicApi, toggleTopicApi, deleteTopicApi, type TopicItem } from '@/api/topics'
import { generateSceneQuestionsApi } from '@/api/articles'

const MAX_SCENE_QUESTIONS = 20
const QS_PAGE_SIZE = 8
const ALL_QS_PAGE_SIZE = 3

type View = 'topics' | 'topic-detail' | 'question-detail' | 'all-questions'

export function TopicsSettingsPage() {
  const [topics, setTopics] = useState<TopicItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('topics')
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null)
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number | null>(null)
  const [newQ, setNewQ] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogName, setDialogName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [genQsLoading, setGenQsLoading] = useState(false)
  const [qsPage, setQsPage] = useState(0)
  const [allQsPage, setAllQsPage] = useState(0)

  useEffect(() => { fetchTopicsApi().then(setTopics).catch(() => {}).finally(() => setLoading(false)) }, [])

  const st = topics.find(t => t.id === selectedTopicId)
  const questions = st?.sceneQuestions || []
  const selectedQuestion = selectedQuestionIdx !== null ? questions[selectedQuestionIdx] : null

  const addTopic = async () => {
    const n = dialogName.trim(); if (!n) return
    setSaving(true)
    try { const t = await createTopicApi(n); setTopics(p => [t, ...p]); setDialogOpen(false); toast.success('已添加') }
    catch (e: any) { toast.error(e?.message || '添加失败') } finally { setSaving(false) }
  }
  const toggle = async (id: number) => { try { const u = await toggleTopicApi(id); setTopics(p => p.map(t => t.id === id ? u : t)) } catch (_: any) {} }
  const confirmDelete = async () => {
    if (!deleteId) return
    try { await deleteTopicApi(deleteId); setTopics(p => p.filter(t => t.id !== deleteId)); if (selectedTopicId === deleteId) setView('topics'); toast.success('已删除') }
    catch (_: any) {} finally { setDeleteId(null) }
  }
  const saveQs = async (arr: string[]) => {
    if (!selectedTopicId) return
    try { const r = await updateTopicApi(selectedTopicId, { sceneQuestions: arr }); setTopics(p => p.map(t => t.id === selectedTopicId ? r : t)) } catch (_: any) {}
  }
  const addQ = async () => {
    const q = newQ.trim(); if (!q || questions.includes(q)) return
    if (questions.length >= MAX_SCENE_QUESTIONS) { toast.error(`场景问题最多 ${MAX_SCENE_QUESTIONS} 个`); return }
    await saveQs([...questions, q]); setNewQ('')
  }
  const removeQ = async (i: number) => { await saveQs(questions.filter((_, j) => j !== i)) }
  const editQ = async (i: number) => {
    const v = editValue.trim(); if (!v || v === questions[i]) { setEditingIdx(null); return }
    const arr = [...questions]; arr[i] = v; await saveQs(arr); setEditingIdx(null)
  }
  const handleAiGenQs = async () => {
    if (!st) return
    if (questions.length >= MAX_SCENE_QUESTIONS) { toast.error(`场景问题最多 ${MAX_SCENE_QUESTIONS} 个`); return }
    setGenQsLoading(true)
    try {
      const generated = await generateSceneQuestionsApi(st.name)
      if (!generated || generated.length === 0) { toast.error('AI 生成失败，请重试'); return }
      const merged = [...questions, ...generated.filter((q: string) => q.trim() && !questions.includes(q))]
      const capped = merged.slice(0, MAX_SCENE_QUESTIONS)
      await saveQs(capped.length > 0 ? capped : generated.slice(0, MAX_SCENE_QUESTIONS))
      if (merged.length > MAX_SCENE_QUESTIONS) toast.success(`已生成，已截取前 ${MAX_SCENE_QUESTIONS} 个问题（上限）`)
      else toast.success(`AI 生成了 ${capped.length - questions.length} 个新问题`)
    } catch { toast.error('AI 生成失败，请重试') }
    finally { setGenQsLoading(false) }
  }

  const allQuestions = topics.flatMap(t => (t.sceneQuestions || []).map(q => ({ topicName: t.name, topicId: t.id, question: q })))

  if (loading) return <div className="flex items-center justify-center py-40"><Loader2 className="h-5 w-5 animate-spin text-[var(--label-quaternary)]" /></div>

  return (
    <div className="space-y-5">
      {/* ---- Header ---- */}
      {view === 'topics' || view === 'all-questions' ? (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title">话题设置</h1>
            <p className="page-desc">管理监控话题和场景问题</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-[10px] bg-[var(--fill-tertiary)] p-0.5">
              <button onClick={() => { setView('topics'); setAllQsPage(0) }} className={`px-5 py-1.5 rounded-[8px] text-[13px] font-medium transition-all ${view === 'topics' ? 'bg-[var(--bg-primary)] shadow-sm text-[var(--label-primary)]' : 'text-[var(--label-secondary)]'}`}>管理话题</button>
              <button onClick={() => { setView('all-questions'); setAllQsPage(0) }} className={`px-5 py-1.5 rounded-[8px] text-[13px] font-medium transition-all ${view === 'all-questions' ? 'bg-[var(--bg-primary)] shadow-sm text-[var(--label-primary)]' : 'text-[var(--label-secondary)]'}`}>场景问题</button>
            </div>
            {view === 'topics' && (
              <button onClick={() => { setDialogName(''); setDialogOpen(true) }} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 active:scale-[0.97] transition-all shadow-none">
                <Plus className="h-4 w-4" />添加话题
              </button>
            )}
          </div>
        </div>
      ) : view === 'topic-detail' ? (
        <div className="flex items-center gap-3">
          <button onClick={() => setView('topics')} className="h-9 w-9 flex items-center justify-center rounded-full text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--label-primary)]">{st?.name || '话题'}</h1>
            <p className="text-[13px] text-[var(--label-secondary)] mt-0.5">{questions.length} 个场景问题</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button onClick={() => setView('topic-detail')} className="h-9 w-9 flex items-center justify-center rounded-full text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--label-primary)]">场景问题详情</h1>
            <p className="text-[13px] text-[var(--label-secondary)] mt-0.5">{st?.name}</p>
          </div>
        </div>
      )}

      {view === 'topics' && <TopicList topics={topics} onSelect={id => { setSelectedTopicId(id); setQsPage(0); setView('topic-detail') }} onToggle={toggle} onDelete={id => setDeleteId(id)} />}
      {view === 'topic-detail' && st && (
        <QuestionManager
          topic={st} questions={questions} newQ={newQ}
          editingIdx={editingIdx} editValue={editValue}
          genQsLoading={genQsLoading} qsPage={qsPage}
          onNewQChange={setNewQ} onAddQ={addQ} onRemoveQ={removeQ}
          onAiGenQs={handleAiGenQs} onQsPageChange={setQsPage}
          onEditStart={(i: number) => { setEditingIdx(i); setEditValue(questions[i]) }}
          onEditSave={editQ} onEditCancel={() => setEditingIdx(null)}
          onEditValueChange={setEditValue}
          onQuestionClick={(i: number) => { setSelectedQuestionIdx(i); setView('question-detail') }}
        />
      )}
      {view === 'question-detail' && selectedQuestion && (
        <QuestionDetail topicName={st?.name || ''} question={selectedQuestion} />
      )}
      {view === 'all-questions' && <AllQuestionsList items={allQuestions} page={allQsPage} onPageChange={setAllQsPage} onTopicClick={id => { setSelectedTopicId(id); setView('topic-detail') }} />}

      {/* ===== Dialogs ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-[20px] p-6 gap-0">
          <DialogHeader className="space-y-1 mb-4"><DialogTitle className="text-[17px] font-semibold text-[var(--label-primary)]">新话题</DialogTitle></DialogHeader>
          <input className="w-full h-11 rounded-[12px] bg-[var(--bg-secondary)] border-0 px-4 text-[17px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-all" placeholder="话题名称" value={dialogName} onChange={e => setDialogName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTopic() } }} autoFocus />
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setDialogOpen(false)} className="h-10 px-5 rounded-full text-[14px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">取消</button>
            <button onClick={addTopic} disabled={saving} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-[14px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 disabled:opacity-40 active:scale-[0.97] transition-all shadow-none">{saving && <Loader2 className="h-4 w-4 animate-spin" />}添加话题</button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="rounded-[20px] p-6 gap-0">
          <DialogHeader className="space-y-2 mb-2"><DialogTitle className="text-[17px] font-semibold text-[var(--label-primary)]">删除话题</DialogTitle><p className="text-[15px] text-[var(--label-secondary)]">此操作无法撤销，该话题下的所有场景问题也将被删除。</p></DialogHeader>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setDeleteId(null)} className="h-10 px-5 rounded-full text-[14px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors">取消</button>
            <button onClick={confirmDelete} className="h-10 px-5 rounded-full text-[14px] font-semibold text-white bg-[var(--system-red)] hover:bg-[var(--system-red)]/90 active:scale-[0.97] transition-all shadow-none">删除</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ================================================================
   Sub-Components
   ================================================================ */

function TopicList({ topics, onSelect, onToggle, onDelete }: { topics: TopicItem[]; onSelect: (id: number) => void; onToggle: (id: number) => void; onDelete: (id: number) => void }) {
  if (topics.length === 0) {
    return (
      <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] py-16 text-center">
        <div className="w-14 h-14 rounded-[16px] bg-[var(--fill-quaternary)] flex items-center justify-center mx-auto mb-4"><Hash className="h-6 w-6 text-[var(--label-tertiary)]" /></div>
        <p className="text-[17px] font-semibold text-[var(--label-tertiary)]">暂无话题</p>
        <p className="text-[14px] text-[var(--label-quaternary)] mt-1">点击右上角「添加话题」开始</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {topics.map(t => (
        <div key={t.id}
          className="group cursor-pointer rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-5 flex flex-col hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 min-h-[120px]"
          onClick={() => onSelect(t.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[17px] font-semibold text-[var(--label-primary)] truncate flex-1">{t.name}</h2>
            {!t.enabled && <span className="text-[11px] font-medium text-[var(--label-tertiary)] bg-[var(--fill-tertiary)] rounded-full px-2 py-0.5 shrink-0 mt-0.5">已暂停</span>}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[13px] text-[var(--label-secondary)]">
            <span>{t.sceneQuestions?.length || 0} 个场景问题</span>
            {t.createTime && <span className="text-[var(--label-quaternary)]">{new Date(t.createTime).toLocaleDateString('zh-CN')}</span>}
          </div>
          <div className="flex items-center gap-1 mt-auto pt-4 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button onClick={() => onToggle(t.id)} className={`h-7 px-3 rounded-full text-[11px] font-medium transition-all ${t.enabled ? 'text-[var(--system-orange)] bg-[var(--system-orange)]/6 hover:bg-[var(--system-orange)]/12' : 'text-[var(--system-green)] bg-[var(--system-green)]/6 hover:bg-[var(--system-green)]/12'}`}>{t.enabled ? '暂停' : '启用'}</button>
            <button onClick={() => onDelete(t.id)} className="h-7 w-7 flex items-center justify-center rounded-[8px] text-[var(--label-tertiary)] hover:text-[var(--system-red)] hover:bg-[var(--system-red)]/6 transition-colors ml-auto"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ))}
    </div>
  )
}

function QuestionManager({ topic, questions, newQ, editingIdx, editValue, genQsLoading, qsPage, onNewQChange, onAddQ, onRemoveQ, onAiGenQs, onQsPageChange, onEditStart, onEditSave, onEditCancel, onEditValueChange, onQuestionClick }: any) {
  const atMax = questions.length >= MAX_SCENE_QUESTIONS
  const totalQsPages = Math.max(1, Math.ceil(questions.length / QS_PAGE_SIZE))
  const safeQsPage = Math.min(qsPage, totalQsPages - 1)
  const pageQuestions = questions.slice(safeQsPage * QS_PAGE_SIZE, (safeQsPage + 1) * QS_PAGE_SIZE)

  return (
    <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] overflow-hidden">
      <div className="px-6 py-5 border-b border-[var(--separator)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[12px] bg-[var(--system-blue)]/8 flex items-center justify-center"><Hash className="h-[18px] w-[18px] text-[var(--system-blue)]" /></div>
          <div>
            <p className="text-[17px] font-semibold text-[var(--label-primary)]">{topic.name}</p>
            <p className="text-[13px] text-[var(--label-secondary)]">{questions.length}/{MAX_SCENE_QUESTIONS} 个场景问题</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 border-b border-[var(--separator)]">
        <div className="flex gap-2.5">
          <input className="flex-1 h-11 rounded-[12px] bg-[var(--bg-secondary)] border-0 px-4 text-[15px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-all" placeholder="手动输入场景问题..." value={newQ} onChange={e => onNewQChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddQ() } }} disabled={atMax} />
          <button onClick={onAddQ} disabled={atMax} className="h-11 px-5 rounded-full text-[14px] font-semibold text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 active:scale-[0.97] transition-all shadow-none shrink-0 disabled:opacity-40">{atMax ? '已满' : '添加'}</button>
          <button onClick={onAiGenQs} disabled={genQsLoading || atMax} className="h-11 px-4 rounded-full text-[14px] font-semibold text-[var(--system-green)] bg-[var(--system-green)]/8 hover:bg-[var(--system-green)]/15 active:scale-[0.97] transition-all shadow-none shrink-0 disabled:opacity-40 flex items-center gap-1.5">
            {genQsLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> 生成中</> : <><Wand2 className="h-4 w-4" /> AI 生成</>}
          </button>
        </div>
      </div>
      <div className="py-2">
        {pageQuestions.length === 0 ? (
          <div className="py-16 text-center">
            <MessageSquare className="h-6 w-6 text-[var(--label-quaternary)] mx-auto mb-3" />
            <p className="text-[15px] font-medium text-[var(--label-quaternary)]">暂无场景问题</p>
          </div>
        ) : (
          pageQuestions.map((q: string, i: number) => {
            const realIdx = safeQsPage * QS_PAGE_SIZE + i
            return (
            <div key={realIdx}>
              {realIdx > 0 && <div className="mx-6 h-px bg-[var(--separator)]" />}
              <div className="flex items-center gap-3 px-6 py-3.5 group hover:bg-[var(--fill-quaternary)] transition-colors cursor-pointer" onClick={() => onQuestionClick(realIdx)}>
                {editingIdx === realIdx ? (
                  <div className="flex-1 flex gap-2" onClick={e => e.stopPropagation()}>
                    <input className="flex-1 h-10 rounded-[10px] bg-white border border-[var(--separator)] px-3.5 text-[15px] text-[var(--label-primary)] focus:outline-none focus:border-[var(--system-blue)] focus:ring-2 focus:ring-[var(--system-blue)]/20 transition-colors" value={editValue} onChange={e => onEditValueChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEditSave(realIdx) }; if (e.key === 'Escape') onEditCancel() }} autoFocus />
                    <button onClick={() => onEditSave(realIdx)} className="h-10 w-10 flex items-center justify-center rounded-full bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 active:scale-[0.97] transition-all shadow-none"><Check className="h-4 w-4 text-white" /></button>
                  </div>
                ) : (
                  <>
                    <span className="text-[11px] font-semibold text-[var(--label-quaternary)] tabular-nums w-5 shrink-0 text-right">{String(realIdx + 1).padStart(2, '0')}</span>
                    <span className="text-[15px] text-[var(--label-primary)] truncate flex-1">{q}</span>
                    <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onEditStart(realIdx)} className="h-8 w-8 flex items-center justify-center rounded-[8px] text-[var(--label-tertiary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onRemoveQ(realIdx)} className="h-8 w-8 flex items-center justify-center rounded-[8px] text-[var(--label-tertiary)] hover:text-[var(--system-red)] hover:bg-[var(--system-red)]/6 transition-colors"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
                      <ChevronRight className="h-4 w-4 text-[var(--label-quaternary)] ml-0.5" />
                    </div>
                  </>
                )}
              </div>
            </div>
          )})
        )}
        {totalQsPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-6 py-3 border-t border-[var(--separator)]">
            <button onClick={() => onQsPageChange(safeQsPage - 1)} disabled={safeQsPage <= 0} className="h-8 px-3 rounded-full text-[12px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">上一页</button>
            <span className="text-[12px] text-[var(--label-tertiary)]">{safeQsPage + 1} / {totalQsPages}</span>
            <button onClick={() => onQsPageChange(safeQsPage + 1)} disabled={safeQsPage >= totalQsPages - 1} className="h-8 px-3 rounded-full text-[12px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">下一页</button>
          </div>
        )}
      </div>
    </div>
  )
}

function QuestionDetail({ topicName, question }: { topicName: string; question: string }) {
  return (
    <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] p-8">
      <p className="text-[11px] font-semibold text-[var(--label-secondary)] mb-2">{topicName}</p>
      <p className="text-[20px] font-semibold text-[var(--label-primary)] leading-relaxed">{question}</p>
      <div className="mt-8 pt-6 border-t border-[var(--separator)]">
        <p className="text-[13px] text-[var(--label-secondary)] leading-relaxed">此场景问题用于监测 AI 平台（ChatGPT、DeepSeek、Kimi 等）中用户的实际提问。当用户搜索类似问题时，系统会追踪品牌是否在 AI 回答中被提及和推荐。</p>
      </div>
    </div>
  )
}

function AllQuestionsList({ items, page, onPageChange, onTopicClick }: { items: { topicName: string; topicId: number; question: string }[]; page: number; onPageChange: (p: number) => void; onTopicClick: (id: number) => void }) {
  if (items.length === 0) {
    return (
      <div className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] py-20 text-center">
        <div className="w-14 h-14 rounded-[16px] bg-[var(--fill-quaternary)] flex items-center justify-center mx-auto mb-4"><MessageSquare className="h-6 w-6 text-[var(--label-tertiary)]" /></div>
        <p className="text-[17px] font-semibold text-[var(--label-tertiary)]">暂无场景问题</p>
        <p className="text-[14px] text-[var(--label-quaternary)] mt-1">在「管理话题」中为话题添加场景问题</p>
      </div>
    )
  }

  const grouped: Record<string, typeof items> = {}
  items.forEach(item => { if (!grouped[item.topicName]) grouped[item.topicName] = []; grouped[item.topicName].push(item) })
  const entries = Object.entries(grouped)
  const totalPages = Math.ceil(entries.length / ALL_QS_PAGE_SIZE)
  const safePage = Math.min(page, totalPages - 1)
  const pageEntries = entries.slice(safePage * ALL_QS_PAGE_SIZE, (safePage + 1) * ALL_QS_PAGE_SIZE)

  return (
    <div className="space-y-4">
      {pageEntries.map(([topicName, qs]) => (
        <div key={topicName} className="rounded-[20px] bg-[var(--bg-primary)] border border-[var(--separator)] overflow-hidden">
          <button className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--fill-quaternary)] transition-colors text-left" onClick={() => onTopicClick(qs[0].topicId)}>
            <div className="w-8 h-8 rounded-[10px] bg-[var(--system-blue)]/8 flex items-center justify-center"><Hash className="h-4 w-4 text-[var(--system-blue)]" /></div>
            <span className="text-[17px] font-semibold text-[var(--label-primary)] flex-1">{topicName}</span>
            <span className="text-[13px] text-[var(--label-secondary)]">{qs.length} 个问题</span>
            <ChevronRight className="h-4 w-4 text-[var(--label-quaternary)]" />
          </button>
          <div className="divide-y divide-[var(--separator)]">
            {qs.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3.5">
                <span className="text-[11px] font-semibold text-[var(--label-quaternary)] tabular-nums w-5 shrink-0 text-right">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[15px] text-[var(--label-primary)]">{item.question}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 0} className="h-9 px-4 rounded-full text-[13px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">上一页</button>
          <span className="text-[13px] text-[var(--label-tertiary)]">{safePage + 1} / {totalPages}</span>
          <button onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages - 1} className="h-9 px-4 rounded-full text-[13px] font-medium text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-quaternary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">下一页</button>
        </div>
      )}
    </div>
  )
}
