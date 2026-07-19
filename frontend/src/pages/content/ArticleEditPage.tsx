import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { fetchArticleApi, updateArticleApi, aiEditStreamApi } from '@/api/articles'
import { toast } from 'sonner'
import { Save, Loader2, FileText, Eye, Sparkles, Send, Square, ArrowLeft } from 'lucide-react'
import { renderMd } from '@/lib/utils'

interface ChatMessage {
  role: 'user' | 'ai'
  content: string
  displayContent?: string
  fullContent?: string
  streaming?: boolean
  backup?: string
}

export function ArticleEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [form, setForm] = useState({ title: '', summary: '', content: '', topic: '', product: '', tags: [] as string[] })
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [aiOpen, setAiOpen] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const saveRef = useRef<() => void>(() => {})

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveRef.current() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!id) return
    fetchArticleApi(Number(id))
      .then((a) => setForm({ title: a.title || '', summary: a.summary || '', content: a.content || '', topic: a.topic || '', product: a.product || '', tags: a.tags || [] }))
      .catch(() => navigate('/content/management'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  useEffect(() => {
    if (chatListRef.current) chatListRef.current.scrollTop = chatListRef.current.scrollHeight
  }, [messages])

  const update = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }))

  const syncScroll = (source: 'editor' | 'preview') => {
    if (syncing.current) return
    syncing.current = true
    const editor = editorRef.current; const preview = previewRef.current
    if (!editor || !preview) { syncing.current = false; return }
    if (source === 'editor') {
      const pct = editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight)
      preview.scrollTop = pct * (preview.scrollHeight - preview.clientHeight)
    } else {
      const pct = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight)
      editor.scrollTop = pct * (editor.scrollHeight - editor.clientHeight)
    }
    requestAnimationFrame(() => { syncing.current = false })
  }

  const handleSave = async () => {
    if (!id) return
    if (!form.content.trim()) { toast.error('正文不能为空'); return }
    setSaving(true)
    try {
      await updateArticleApi(Number(id), { ...form, tags: form.tags.filter((t) => t.trim()) })
      toast.success('保存成功'); navigate('/content/management')
    } catch { toast.error('保存失败') }
    finally { setSaving(false) }
  }
  saveRef.current = handleSave

  const handleRestore = (backup: string) => { update('content', backup); toast.success('已复原到修改前的内容') }

  const stopStreaming = () => {
    abortRef.current?.(); abortRef.current = null
    setAiLoading(false)
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
  }

  const handleAiChat = () => {
    const msg = chatInput.trim()
    if (!msg || !id) return
    const backup = form.content
    setChatInput('')
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setAiLoading(true)
    const aiMsgIndex = messages.length + 1
    setMessages((prev) => [...prev, { role: 'ai', content: '', streaming: true, backup }])
    const cancel = aiEditStreamApi(Number(id), form.content, msg,
      (token) => setMessages((prev) => { const u = [...prev]; const ai = u[aiMsgIndex]; if (ai) u[aiMsgIndex] = { ...ai, content: ai.content + token }; return u }),
      () => {
        setAiLoading(false)
        setMessages((prev) => {
          const u = [...prev]; const ai = u[aiMsgIndex]
          if (ai) {
            const raw = ai.content
            const cm = raw.match(/【完整文章】\s*([\s\S]*)/)
            const sm = raw.match(/【修改说明】\s*([\s\S]*?)(?:【完整文章】|$)/)
            const newContent = cm ? cm[1].trim() : raw
            const summary = sm ? sm[1].trim() : ''
            update('content', newContent)
            u[aiMsgIndex] = { ...ai, displayContent: summary, fullContent: newContent, streaming: false }
          }
          return u
        })
      },
      (err) => {
        setAiLoading(false)
        setMessages((prev) => { const u = [...prev]; const ai = u[aiMsgIndex]; if (ai) u[aiMsgIndex] = { ...ai, content: '抱歉，处理失败：' + err, streaming: false }; return u })
      },
    )
    abortRef.current = cancel
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-3)]" />
    </div>
  )

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-[1400px] flex-col px-4">

      {/* ===== Top Bar ===== */}
      <div className="flex shrink-0 items-center justify-between py-3">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/content/management')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />返回
          </button>
          <div>
            <h1 className="text-[18px] font-bold text-[var(--ink)] tracking-[-0.02em]">{form.title || '编辑文章'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-[12px] text-[13px] font-medium" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4" />AI 助手
          </Button>
          <Button className="h-9 gap-1.5 rounded-[12px] text-[13px] font-semibold" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存
          </Button>
        </div>
      </div>

      {/* ===== Editor + Preview ===== */}
      <div className="flex flex-1 gap-4 min-h-0 pb-4">
        {/* Editor */}
        <div className="flex w-full lg:w-1/2 flex-col rounded-[16px] border border-[var(--line)] bg-[var(--card)] min-h-0 overflow-hidden shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--line)] shrink-0">
            <div className="w-7 h-7 rounded-[8px] bg-[var(--fill-tertiary)] grid place-items-center">
              <FileText className="h-3.5 w-3.5 text-[var(--ink-2)]" strokeWidth={1.7} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-[0.06em]">Markdown 编辑</span>
            <span className="ml-auto text-[10px] text-[var(--ink-3)]/60">Ctrl+S 保存</span>
          </div>
          <textarea ref={editorRef} value={form.content} onChange={(e) => update('content', e.target.value)}
            onScroll={() => syncScroll('editor')}
            className="flex-1 resize-none border-0 bg-transparent px-5 py-4 text-[14px] text-[var(--ink)] font-mono leading-[1.7] focus:outline-none placeholder:text-[var(--ink-3)]/40 overflow-y-auto"
            placeholder="输入 Markdown 正文…" wrap="soft" />
        </div>

        {/* Preview */}
        <div className="flex w-full lg:w-1/2 flex-col rounded-[16px] border border-[var(--line)] bg-[var(--card)] min-h-0 overflow-hidden shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--line)] shrink-0">
            <div className="w-7 h-7 rounded-[8px] bg-[var(--fill-tertiary)] grid place-items-center">
              <Eye className="h-3.5 w-3.5 text-[var(--ink-2)]" strokeWidth={1.7} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-[0.06em]">实时预览</span>
          </div>
          <div ref={previewRef} onScroll={() => syncScroll('preview')} className="flex-1 overflow-y-auto px-6 py-5">
            {form.content ? (
              <div className="prose max-w-none
                prose-headings:text-[var(--ink)] prose-headings:font-bold
                prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-4
                prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
                prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
                prose-p:text-[15px] prose-p:leading-[1.75] prose-p:text-[var(--ink)]/85
                prose-li:text-[14px] prose-li:leading-[1.7]
                prose-strong:text-[var(--ink)] prose-strong:font-semibold
                prose-a:text-[var(--accent-d)]
                [&_ul]:my-5 [&_ol]:my-5"
                dangerouslySetInnerHTML={{ __html: renderMd(form.content) }} />
            ) : (
              <p className="text-[14px] text-[var(--ink-3)]/40 italic">在左侧输入 Markdown，这里实时预览…</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== AI 助手浮层 ===== */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/15" onClick={() => setAiOpen(false)}>
          <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[0_16px_48px_rgba(0,0,0,0.12)] w-full max-w-lg max-h-[520px] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-d))' }}>
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-[15px] font-semibold">AI 写作助手</h3>
              </div>
              <button onClick={() => setAiOpen(false)} className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">✕</button>
            </div>

            {/* Chat */}
            <div ref={chatListRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[160px]">
              {messages.length === 0 && (
                <div className="text-center py-4 space-y-3">
                  <p className="text-[13px] text-[var(--ink-3)]">输入指令让 AI 帮你修改文章</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {['语气更专业', '缩短到 800 字', '增加案例说明', '优化段落结构', '修正语法错误'].map((tip) => (
                      <button key={tip}
                        className="rounded-[8px] border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--border-strong)] hover:bg-[var(--fill-tertiary)] transition-colors"
                        onClick={() => setChatInput(tip)}>{tip}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex text-[13px] ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <span className={`max-w-[85%] rounded-[12px] px-4 py-2.5 leading-relaxed ${
                    m.role === 'user' ? 'bg-[var(--accent-soft)] text-[var(--accent-d)] font-medium' : 'bg-[var(--fill-tertiary)] text-[var(--ink)]/85'
                  }`}>
                    {m.streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : (
                      <>
                        {m.displayContent ? (
                          <div>
                            <p className="text-[12px] font-medium text-[var(--ink)]/80 leading-relaxed whitespace-pre-wrap">{m.displayContent}</p>
                            <p className="text-[10px] text-[var(--ink-3)]/50 mt-1.5">✅ 全文已应用至编辑器</p>
                          </div>
                        ) : m.fullContent ? (
                          <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">{m.fullContent.slice(0, 500)}{m.fullContent.length > 500 ? '…' : ''}</div>
                        ) : (
                          <span>{m.content}</span>
                        )}
                        {m.backup && (
                          <button className="mt-2 text-[12px] underline underline-offset-2 text-[var(--accent-d)] hover:text-[var(--accent)] block"
                            onClick={() => handleRestore(m.backup!)}>↩ 复原修改</button>
                        )}
                      </>
                    )}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--line)] px-4 py-3">
              <div className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5">
                <input
                  className="flex-1 border-0 bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)]/50"
                  placeholder="输入 AI 修改指令…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiChat() } }}
                />
                {aiLoading ? (
                  <button className="shrink-0 rounded-[8px] p-1.5 text-[var(--red)]/70 hover:text-[var(--red)]" onClick={stopStreaming}>
                    <Square className="h-4 w-4" />
                  </button>
                ) : (
                  <button className="shrink-0 rounded-[8px] p-1.5 text-[var(--accent)]/60 hover:text-[var(--accent)] disabled:opacity-25 transition-colors"
                    onClick={handleAiChat} disabled={!chatInput.trim()}>
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
