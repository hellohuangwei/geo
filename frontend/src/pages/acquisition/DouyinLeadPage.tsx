import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  EyeOff,
  FileText,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Send,
  X,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContentCard } from '@/components/ContentCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { analyzeCommentsApi, checkCdpStatusApi, ensureCdpApi } from '@/api/acquisition'
import { fetchBrandProfileApi } from '@/api/brandProfile'
import {
  addLeadFromDouyinComment,
  batchSendDouyinMessages,
  deleteDouyinTask,
  fetchDouyinLeadWorkspace,
  getDefaultDouyinConfig,
  ignoreDouyinComment,
  pauseDouyinTask,
  saveDouyinTask,
  startDouyinTask,
  updateDouyinLead,
  updateDouyinLeadStatus,
} from '@/services/douyinLeadService'
import type {
  DouyinAcquisitionConfig,
  DouyinAcquisitionTask,
  DouyinImportedComment,
  DouyinIntentLevel,
  DouyinLead,
  DouyinLeadStatus,
  DouyinLeadWorkspace,
  DouyinRunLog,
  DouyinTaskStatus,
} from '@/types/douyinLead'
import { cn } from '@/lib/utils'

const COMMENT_PAGE_SIZE = 50
const TASK_PAGE_SIZE = 4


const intentOptions: Array<{ value: 'all' | DouyinIntentLevel; label: string }> = [
  { value: 'all', label: '全部评论' },
  { value: 'high', label: '高意向' },
  { value: 'medium', label: '中意向' },
  { value: 'low', label: '低意向' },
  { value: 'none', label: '无明显意向' },
]

const autoLeadLevels: Array<{ value: Exclude<DouyinIntentLevel, 'none'>; label: string }> = [
  { value: 'high', label: '高意向' },
  { value: 'medium', label: '中意向' },
  { value: 'low', label: '低意向' },
]

const leadStatusOptions: Array<{ value: DouyinLeadStatus; label: string }> = [
  { value: 'new', label: '新客户' },
  { value: 'pending', label: '待跟进' },
  { value: 'contacted', label: '已触达' },
  { value: 'communicating', label: '沟通中' },
  { value: 'converted', label: '已转化' },
  { value: 'invalid', label: '无效' },
]

export function DouyinLeadPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workspace, setWorkspace] = useState<DouyinLeadWorkspace | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [config, setConfig] = useState<DouyinAcquisitionConfig>(() => getDefaultDouyinConfig())
  const [search, setSearch] = useState('')
  const [intentFilter, setIntentFilter] = useState<'all' | DouyinIntentLevel>('all')
  const [submitting, setSubmitting] = useState(false)
  const [commentPage, setCommentPage] = useState(1)
  const [taskPage, setTaskPage] = useState(1)
  const [brandIndustry, setBrandIndustry] = useState('')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [messageDialogOpen, setMessageDialogOpen] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [cdpKillDialogOpen, setCdpKillDialogOpen] = useState(false)
  const streamAbortRef = useRef<AbortController | null>(null)
  const searchLoadedOnceRef = useRef(false)
  const refreshSeqRef = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [data, brand] = await Promise.all([
        fetchDouyinLeadWorkspace(undefined, 0, search),
        fetchBrandProfileApi().catch(() => null),
      ])
      setWorkspace(data)
      if (brand?.industry) setBrandIndustry(brand.industry.trim())
      const firstTask = data.tasks[0]
      setSelectedTaskId((prev) => {
        if (prev || !firstTask) return prev
        const taskConfig = firstTask.config
        // 如果品牌有行业数据且任务配置中未设置行业，自动填入
        if (brand?.industry?.trim() && !taskConfig.industry) {
          setConfig({ ...taskConfig, industry: brand.industry.trim() })
        } else {
          setConfig(taskConfig)
        }
        return firstTask.id
      })
    } catch {
      setError('抖音获客配置加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return () => streamAbortRef.current?.abort()
  }, [])

  const selectedTask = workspace?.tasks.find((task) => task.id === selectedTaskId) ?? null

  const taskKeyword = useMemo(() => (config.keyword || selectedTask?.config.keyword || '').trim(), [config.keyword, selectedTask?.config.keyword])

  const taskComments = useMemo(() => {
    const list = workspace?.comments.filter((comment) => !selectedTaskId || comment.taskId === selectedTaskId) ?? []
    return list.filter((comment) => {
      const q = search.trim().toLowerCase()
      // 有关键词筛选时：匹配搜索词；无搜索词时：只显示跟采集关键词匹配的评论（防止后端未过滤）
      const matchKeyword = !q
        ? !taskKeyword || comment.keyword === taskKeyword
        : (comment.content.toLowerCase().includes(q) ||
           comment.nickname.toLowerCase().includes(q) ||
           comment.keyword.toLowerCase().includes(q) ||
           comment.analysis.demandKeywords.some((item) => item.toLowerCase().includes(q)))
      const matchIntent = intentFilter === 'all' || comment.analysis.level === intentFilter
      return matchKeyword && matchIntent && !comment.ignored
    })
  }, [workspace, selectedTaskId, search, intentFilter, taskKeyword])

  const selectedLeads = useMemo(() => {
    return workspace?.leads.filter((lead) => !selectedTaskId || lead.taskId === selectedTaskId) ?? []
  }, [workspace, selectedTaskId])

  const allTasks = workspace?.tasks ?? []
  const commentsPage = useMemo(() => {
    const total = workspace?.commentTotal ?? taskComments.length
    const pages = Math.max(1, Math.ceil(total / COMMENT_PAGE_SIZE))
    return {
      items: taskComments,
      total,
      pages,
      current: commentPage,
      start: (commentPage - 1) * COMMENT_PAGE_SIZE,
      end: Math.min(commentPage * COMMENT_PAGE_SIZE, total),
    }
  }, [taskComments, commentPage, workspace?.commentTotal])
  const tasksPage = useMemo(() => paginate(allTasks, taskPage, TASK_PAGE_SIZE), [allTasks, taskPage])

  useEffect(() => setCommentPage(1), [selectedTaskId, search, intentFilter])
  useEffect(() => setTaskPage(1), [allTasks.length])

  const stats = useMemo(() => {
    return {
      tasks: workspace?.tasks.length ?? 0,
      running: workspace?.tasks.filter((task) => task.status === 'running').length ?? 0,
      comments: workspace?.comments.length ?? 0,
      leads: workspace?.leads.length ?? 0,
      highLeads: workspace?.leads.filter((lead) => lead.level === 'high').length ?? 0,
    }
  }, [workspace])

  const updateConfig = <K extends keyof DouyinAcquisitionConfig>(key: K, value: DouyinAcquisitionConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const getCommittedConfig = () => {
    const nextConfig: DouyinAcquisitionConfig = {
      ...config,
      keyword: config.keyword.trim(),
    }
    setConfig(nextConfig)
    return nextConfig
  }

  const refresh = async (taskId = selectedTaskId, page = 0, searchText = search) => {
    const seq = ++refreshSeqRef.current
    const data = await fetchDouyinLeadWorkspace(taskId || undefined, page, searchText)
    if (seq !== refreshSeqRef.current) return data
    setWorkspace(data)
    return data
  }

  useEffect(() => {
    if (!searchLoadedOnceRef.current) {
      searchLoadedOnceRef.current = true
      return
    }
    if (!selectedTaskId) return

    const timer = window.setTimeout(() => {
      void refresh(selectedTaskId, 0, search)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [search])

  const syncSelectedTask = (task: DouyinAcquisitionTask) => {
    setSelectedTaskId(task.id)
    setConfig(task.config)
  }

  const handleSave = async () => {
    const nextConfig = getCommittedConfig()
    if (!nextConfig.keyword) {
      toast.error('请配置搜索关键词')
      return null
    }
    setSubmitting(true)
    try {
      const task = await saveDouyinTask({
        id: selectedTaskId || undefined,
        name: nextConfig.keyword || '采集任务',
        config: nextConfig,
      })
      syncSelectedTask(task)
      await refresh(task.id)
      toast.success('采集配置已保存')
      return task
    } finally {
      setSubmitting(false)
    }
  }

  /** CDP 已就绪时的正常采集流程 */
  const doSampling = async () => {
    const nextConfig = getCommittedConfig()
    if (!nextConfig.keyword) {
      toast.error('请先配置搜索关键词')
      return
    }
    const task = await saveDouyinTask({
      id: selectedTaskId || undefined,
      name: nextConfig.keyword || '采集任务',
      config: nextConfig,
    })
    syncSelectedTask(task)
    setWorkspace((prev) => prev ? {
      ...prev,
      comments: [],
      tasks: prev.tasks.map((item) =>
        item.id === task.id ? { ...item, status: 'running' as const } : item
      ),
    } : null)

    toast.info(`正在采集：${nextConfig.keyword}`)
    const result = await startDouyinTask(task.id, nextConfig.keyword)
    const data = await refresh(task.id, 0)

    setWorkspace((prev) => prev ? {
      ...prev,
      comments: data.comments,
      commentTotal: data.commentTotal,
      commentPages: data.commentPages,
      commentPage: data.commentPage,
      tasks: prev.tasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: result.captchaDetected ? 'executor_required' as const : 'completed' as const,
              analyzedCommentCount: result.captchaDetected ? item.analyzedCommentCount : result.commentCount,
            }
          : item
      ),
    } : null)
    if (result.captchaDetected) {
      toast.warning('检测到抖音验证码，请在当前抖音页面手动完成验证。GEO 已暂停采集，不会刷新验证页面。', { duration: 12000 })
      return
    }
    toast.success(`采集完成，共 ${result.commentCount} 条评论`)
  }

  /** 点击"开始采集"——先检查 CDP，不通则弹确认窗 */
  const handleStart = async () => {
    const nextConfig = getCommittedConfig()
    if (!nextConfig.keyword) {
      toast.error('请先配置搜索关键词')
      return
    }
    setSubmitting(true)
    let cdpReady = false
    try {
      const status = await checkCdpStatusApi()
      cdpReady = status.cdpReady
    } catch { /* 检查失败按 CDP 不通处理 */ }
    if (!cdpReady) {
      setSubmitting(false)
      setCdpKillDialogOpen(true)
      return
    }
    // CDP 已就绪，直接采集
    try { await doSampling() } catch (err) {
      toast.error(err instanceof Error ? err.message : '采集失败')
    } finally { setSubmitting(false) }
  }

  /** 用户确认重启浏览器 → 先存配置 → 重启 CDP → 走正常采集流程 */
  const handleCdpConfirm = async () => {
    setCdpKillDialogOpen(false)
    setSubmitting(true)
    try {
      // 先保存任务配置，防止浏览器关闭后配置丢失
      const nextConfig = getCommittedConfig()
      const task = await saveDouyinTask({
        id: selectedTaskId || undefined,
        name: nextConfig.keyword || '采集任务',
        config: nextConfig,
      })
      syncSelectedTask(task)

      await ensureCdpApi() // 重启 Edge（最小化，不抢焦点）
      // 重启后走跟 CDP 就绪时完全一样的采集流程
      await doSampling()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '采集失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAiAnalyze = async () => {
    const taskComments = (workspace?.comments ?? []).filter(
      (c) => !selectedTaskId || c.taskId === selectedTaskId,
    )
    if (taskComments.length === 0) {
      toast.error('没有可分析的评论，请先采集')
      return
    }
    setAiAnalyzing(true)
    try {
      const result = await analyzeCommentsApi({
        comments: taskComments.map((c) => ({
          nickname: c.nickname,
          content: c.content,
          videoUrl: c.videoUrl,
          keyword: c.keyword,
          likes: c.likes,
          replyCount: c.replyCount,
          publishedAt: c.publishedAt,
        })),
        keyword: config.keyword,
        industry: config.industry,
      })
      // 更新 workspace 中的评论分析结果
      const analyzedMap = new Map<string, any>()
      for (const ac of result.comments) {
        analyzedMap.set(ac.content, ac.analysis)
      }
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((c) => {
                const analysis = analyzedMap.get(c.content)
                return analysis ? { ...c, analysis } : c
              }),
            }
          : prev,
      )
      toast.success(`AI 分析完成，共 ${result.comments.length} 条`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 分析失败')
    } finally {
      setAiAnalyzing(false)
    }
  }

  const handlePause = async () => {
    if (!selectedTaskId) return
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    await pauseDouyinTask(selectedTaskId)
    await refresh()
    setSubmitting(false)
    toast.success('任务已暂停')
  }

  const handleDelete = async (taskId: string) => {
    await deleteDouyinTask(taskId)
    setSelectedTaskId('')
    setConfig(getDefaultDouyinConfig())
    await refresh('')
    toast.success('任务已删除')
  }

  const handleSelectTask = (task: DouyinAcquisitionTask) => {
    syncSelectedTask(task)
    void refresh(task.id)
  }

  const handleAddLead = async (comment: DouyinImportedComment) => {
    const lead = await addLeadFromDouyinComment(comment.id)
    await refresh(comment.taskId)
    if (lead) toast.success('已加入潜在客户库')
    else toast.error('该用户已在客户库中')
  }

  const handleIgnore = async (comment: DouyinImportedComment) => {
    await ignoreDouyinComment(comment.id)
    await refresh(comment.taskId)
    toast.success('已忽略该评论')
  }

  // --- Lead selection & message ---

  const toggleLeadSelect = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  const toggleSelectAllLeads = () => {
    if (selectedLeads.length === 0) return
    setSelectedLeadIds((prev) =>
      prev.length === selectedLeads.length ? [] : selectedLeads.map((l) => l.id),
    )
  }

  const handleBatchSendMessages = async () => {
    if (selectedLeadIds.length === 0) return
    setMessageDialogOpen(true)
  }

  const handleSendMessages = async () => {
    if (!messageText.trim()) { toast.error('请输入消息内容'); return }
    setSending(true)
    try {
      const result = await batchSendDouyinMessages(selectedLeadIds, messageText.trim())
      setMessageDialogOpen(false)
      setMessageText('')
      setSelectedLeadIds([])
      toast.success(`发送完成：${result.success} 成功，${result.failed} 失败`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleLeadStatusChange = async (lead: DouyinLead, status: DouyinLeadStatus) => {
    const updated = await updateDouyinLeadStatus(lead.id, status)
    if (!updated) {
      toast.error('客户状态更新失败')
      return
    }
    setWorkspace((prev) => prev ? {
      ...prev,
      leads: prev.leads.map((item) => item.id === updated.id ? updated : item),
    } : prev)
  }

  const handleLeadNoteBlur = async (lead: DouyinLead, note: string) => {
    if (note === lead.note) return
    const updated = await updateDouyinLead(lead.id, { note })
    if (!updated) {
      toast.error('客户备注保存失败')
      return
    }
    setWorkspace((prev) => prev ? {
      ...prev,
      leads: prev.leads.map((item) => item.id === updated.id ? updated : item),
    } : prev)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[126px] rounded-[20px]" />
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
          <Skeleton className="h-[520px] rounded-[20px]" />
          <Skeleton className="h-[520px] rounded-[20px]" />
          <Skeleton className="h-[520px] rounded-[20px]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <ContentCard padding="large" className="text-center">
        <p className="text-[15px] font-semibold text-[var(--ink)]">{error}</p>
        <Button className="mt-4" onClick={load}>重新加载</Button>
      </ContentCard>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
            <h1 className="text-[24px] font-bold tracking-[-0.02em] text-[var(--ink)]">抖音获客</h1>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
            配置关键词后自动任务，系统会打开抖音搜索页，采集评论，AI 分析意向，并沉淀客户。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={submitting || aiAnalyzing} className="h-10 rounded-[12px] px-5">
            保存配置
          </Button>
          <Button
            onClick={handleStart}
            disabled={submitting || aiAnalyzing}
            className="h-10 gap-2 rounded-[12px] px-6 shadow-[0_10px_24px_rgba(68,170,20,0.22)]"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            开始采集
          </Button>
        </div>
      </div>

      {selectedTask?.status === 'analyzing' && (
        <div className="flex items-center gap-2 rounded-[12px] border border-[rgba(244,169,75,0.25)] bg-[rgba(244,169,75,0.08)] px-4 py-3 text-[13px] text-[var(--ink)]">
          <AlertCircle className="h-4 w-4 text-[var(--orange)]" />
          <span>数据已经采集完成，AI 分析中...</span>
        </div>
      )}

      <StatsGrid stats={stats} />

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <ControlPanel
          config={config}
          selectedTask={selectedTask}
          submitting={submitting}
          collectedCount={taskComments.length}
          brandIndustry={brandIndustry}
          onConfigChange={updateConfig}
          onStart={handleStart}
          onPause={handlePause}
        />

        <div className="min-w-0 space-y-4">
          <ContentCard padding="normal" className="min-h-[366px] min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-[16px] font-bold text-[var(--ink)]">
                <FileText className="h-4 w-4 text-[var(--accent-d)]" />
                评论
                {selectedTask?.config.keyword && (
                  <span className="text-[12px] font-medium text-[var(--ink-3)]">
                    · {selectedTask.config.keyword}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAiAnalyze}
                  disabled={aiAnalyzing || taskComments.length === 0}
                  className="h-8 gap-1.5 rounded-[9px] text-[12px]"
                >
                  {aiAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  AI 分析
                </Button>
                <Select value={intentFilter} onValueChange={(value) => setIntentFilter(value as 'all' | DouyinIntentLevel)}>
                  <SelectTrigger className="h-9 w-full sm:w-[138px]">
                    <SelectValue />
                  </SelectTrigger>
                <SelectContent>
                  {intentOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
              <Input
                className="h-10 pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索评论、用户名、关键词"
              />
            </div>

            <div className="mt-4 h-[620px] overflow-y-auto space-y-3">
              {commentsPage.items.length === 0 ? (
                <EmptyState
                  icon={<MessageCircle className="h-12 w-12" />}
                  title="暂无采集到评论"
                  description="点击开始采集后会打开抖音搜索页，采集评论并进入 AI 分析。"
                />
              ) : commentsPage.items.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  onAddLead={() => handleAddLead(comment)}
                  onIgnore={() => handleIgnore(comment)}
                />
              ))}
            </div>

            <PaginationBar
              className="mt-4"
              page={commentsPage}
              onPageChange={(p) => { setCommentPage(p); void refresh(selectedTaskId, p - 1, search) }}
              itemLabel="评论"
            />
          </ContentCard>

          <LeadLibrary
            leads={selectedLeads}
            selectedIds={selectedLeadIds}
            onToggleSelect={toggleLeadSelect}
            onToggleSelectAll={toggleSelectAllLeads}
            onBatchSend={handleBatchSendMessages}
            onStatusChange={handleLeadStatusChange}
            onNoteBlur={handleLeadNoteBlur}
          />
        </div>

        <ContentCard padding="normal" className="min-h-[630px] self-start xl:row-span-2">
          <SectionTitle icon={<Database className="h-4 w-4" />} title="获客任务" meta={`${allTasks.length} 个`} />
          <div className="mt-4 space-y-3">
            {tasksPage.items.length === 0 ? (
              <EmptyState title="还没有任务" description="保存配置或开始采集后会生成任务。" compact />
            ) : tasksPage.items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                active={task.id === selectedTaskId}
                onSelect={() => handleSelectTask(task)}
                onDelete={() => handleDelete(task.id)}
              />
            ))}
          </div>
          <TaskListPager page={tasksPage} onPageChange={setTaskPage} />
        </ContentCard>

      </section>

      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量发私信</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--ink-2)]">
              将向 <span className="font-semibold text-[var(--ink)]">{selectedLeadIds.length}</span> 位客户发送私信：
            </p>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={5}
              className="w-full resize-none rounded-[10px] border border-[var(--line)] bg-transparent px-3 py-2.5 text-[13px] outline-none focus:border-[var(--accent)]"
              placeholder="输入私信内容..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setMessageDialogOpen(false); setMessageText('') }} disabled={sending}>
                取消
              </Button>
              <Button onClick={handleSendMessages} disabled={sending || !messageText.trim()} className="gap-1.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? '发送中...' : '发送'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 浏览器重启确认弹窗 */}
      <Dialog open={cdpKillDialogOpen} onOpenChange={setCdpKillDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>需要重启浏览器</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-[10px] border border-[rgba(244,169,75,0.3)] bg-[rgba(244,169,75,0.08)] px-4 py-3">
              <p className="text-[13px] leading-relaxed text-[var(--ink)]">
                <AlertCircle className="mr-1.5 inline-block h-4 w-4 text-[var(--orange)]" />
                采集工具需要接管浏览器，将 <span className="font-semibold text-[var(--orange)]">关闭并重启 Edge</span>。
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
                重启后会自动打开 GEO 页面并开始采集，登录状态不会丢失。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCdpKillDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCdpConfirm} className="gap-1.5 bg-[var(--orange)] hover:bg-[var(--orange)]/90">
                确认重启
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ──────────── Stat Item (no card border, clean row) ──────────── */

function StatItem({
  icon, label, value, primary, accent,
}: {
  icon: ReactNode; label: string; value: number; primary?: boolean; accent?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn(
        'flex h-8 w-8 items-center justify-center rounded-[9px]',
        accent ? 'bg-[rgba(111,168,56,0.12)] text-[var(--accent-d)]' : 'bg-[var(--fill-tertiary)] text-[var(--ink-3)]',
      )}>
        {icon}
      </span>
      <div>
        <div className={cn(
          'num text-[18px] font-bold leading-none',
          primary ? 'text-[var(--accent-d)]' : 'text-[var(--ink)]',
        )}>
          {value}
        </div>
        <div className="mt-0.5 text-[11px] font-medium text-[var(--ink-3)]">{label}</div>
      </div>
    </div>
  )
}

function StatsGrid({ stats }: { stats: Record<'tasks' | 'running' | 'comments' | 'leads' | 'highLeads', number> }) {
  const cards = [
    { icon: <Database className="h-6 w-6" />, label: '获客任务', value: stats.tasks, hint: '全部任务', tone: 'green' },
    { icon: <Play className="h-6 w-6" />, label: '运行中', value: stats.running, hint: '进行中任务', tone: 'green' },
    { icon: <MessageCircle className="h-6 w-6" />, label: '已分析评论', value: stats.comments, hint: '今日新增', tone: 'orange' },
    { icon: <Users className="h-6 w-6" />, label: '潜在客户', value: stats.leads, hint: '待跟进客户', tone: 'blue' },
    { icon: <BarChart3 className="h-6 w-6" />, label: '高意向客户', value: stats.highLeads, hint: '重点客户', tone: 'purple' },
  ]

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <ContentCard key={card.label} padding="normal" className="min-h-[126px]">
          <div className="flex items-start gap-4">
            <span className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]',
              card.tone === 'green' && 'bg-[rgba(139,195,74,0.14)] text-[var(--accent-d)]',
              card.tone === 'orange' && 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)]',
              card.tone === 'blue' && 'bg-[rgba(91,141,239,0.13)] text-[var(--blue)]',
              card.tone === 'purple' && 'bg-[rgba(156,91,239,0.12)] text-[#8a3fd1]',
            )}>
              {card.icon}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-[var(--ink-2)]">{card.label}</div>
              <div className="num mt-2 text-[26px] font-bold leading-none text-[var(--ink)]">{card.value}</div>
              <div className="mt-3 text-[11px] text-[var(--ink-3)]">{card.hint}</div>
            </div>
          </div>
        </ContentCard>
      ))}
    </div>
  )
}


/* ──────────── Control Panel ──────────── */

function ControlPanel({
  config,
  selectedTask,
  submitting,
  collectedCount,
  brandIndustry,
  onConfigChange,
  onStart,
  onPause,
}: {
  config: DouyinAcquisitionConfig
  selectedTask: DouyinAcquisitionTask | null
  submitting: boolean
  collectedCount: number
  brandIndustry: string
  onConfigChange: <K extends keyof DouyinAcquisitionConfig>(key: K, value: DouyinAcquisitionConfig[K]) => void
  onStart: () => Promise<void>
  onPause: () => Promise<void>
}) {
  const canPause = selectedTask?.status === 'running' || selectedTask?.status === 'analyzing' || selectedTask?.status === 'executor_required'

  return (
    <ContentCard padding="normal" className="min-h-[556px]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[16px] font-bold text-[var(--ink)]">采集设置</h2>
      </div>

      <div className="mt-5 flex min-h-[462px] flex-col">
        <div className="space-y-4">
        <Field label="搜索关键词">
          <Input
            value={config.keyword}
            onChange={(event) => onConfigChange('keyword', event.target.value)}
            placeholder="输入本次要采集的关键词"
          />
        </Field>
        <p className="text-[12px] leading-relaxed text-[var(--ink-3)]">
          每次任务只搜索一个关键词，系统会自动遍历该关键词下的视频并评论。
        </p>

        <IndustryField
          value={config.industry}
          brandIndustry={brandIndustry}
          onChange={(value) => onConfigChange('industry', value)}
        />

        <div>
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="font-semibold text-[var(--ink-2)]">目标评论数</span>
            <span className="num text-[var(--ink-3)]">{collectedCount} / {config.targetCommentCount}</span>
          </div>
          <Input
            type="number"
            min={1}
            value={config.targetCommentCount}
            onChange={(event) => onConfigChange('targetCommentCount', Math.max(1, Number(event.target.value)))}
          />
        </div>

        <div>
          <div className="mb-2 text-[12px] font-semibold text-[var(--ink-2)]">自动加入客户库</div>
          <div className="flex flex-wrap gap-2">
            {autoLeadLevels.map((item) => {
              const active = config.autoAddLeadLevels.includes(item.value)
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    onConfigChange(
                      'autoAddLeadLevels',
                      active
                        ? config.autoAddLeadLevels.filter((level) => level !== item.value)
                        : [...config.autoAddLeadLevels, item.value],
                    )
                  }}
                  className={cn(
                    'h-8 rounded-[9px] px-3 text-[12px] font-semibold transition-colors active:scale-[0.97]',
                    active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--fill-tertiary)] text-[var(--ink-2)]',
                  )}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-3 pt-8">
          <Button variant="outline" onClick={onPause} disabled={!canPause} className="gap-2">
            <Pause className="h-4 w-4" />
            暂停任务
          </Button>
          <Button onClick={onStart} disabled={submitting} className="gap-2 shadow-[0_3px_10px_rgba(139,195,74,0.16)]">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            重新开始
          </Button>
        </div>
      </div>
    </ContentCard>
  )
}

/* ──────────── Task Card ──────────── */

function TaskCard({
  task,
  active,
  onSelect,
  onDelete,
}: {
  task: DouyinAcquisitionTask
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn(
      'rounded-[14px] border p-4 transition-colors',
      active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--fill-quaternary)]',
    )}>
      <button className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn(
              'truncate text-[14px] font-semibold',
              active ? 'text-[var(--accent-d)]' : 'text-[var(--ink)]',
            )}>
              {task.name}
            </div>
            <div className="mt-1 truncate text-[12px] text-[var(--ink-3)]">{task.config.keyword || '未配置关键词'}</div>
          </div>
          <StatusBadge status={task.status} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniStat label="视频" value={task.collectedVideoCount} />
          <MiniStat label="评论" value={task.analyzedCommentCount} />
          <MiniStat label="客户" value={task.leadCount} />
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
        <span className="text-[11px] text-[var(--ink-3)]">{formatTime(task.updatedAt)}</span>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/* ──────────── Field ──────────── */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-semibold text-[var(--ink-2)]">{label}</span>
      {children}
    </label>
  )
}

const FALLBACK_INDUSTRIES = [
  { value: 'education', label: '教育' },
  { value: 'finance', label: '金融' },
  { value: 'healthcare', label: '医疗健康' },
  { value: 'ecommerce', label: '电商' },
  { value: 'realestate', label: '房地产' },
  { value: 'automotive', label: '汽车' },
  { value: 'catering', label: '餐饮' },
  { value: 'travel', label: '旅游' },
  { value: 'beauty', label: '美妆' },
  { value: 'momBaby', label: '母婴' },
  { value: 'home', label: '家居' },
  { value: 'other', label: '其他' },
]

function IndustryField({ value, brandIndustry, onChange }: { value: string; brandIndustry: string; onChange: (value: string) => void }) {
  const options = useMemo(() => {
    const list: Array<{ value: string; label: string; fromBrand?: boolean }> = []
    if (brandIndustry) {
      list.push({ value: brandIndustry, label: `🏷 ${brandIndustry}（品牌）`, fromBrand: true })
    }
    for (const item of FALLBACK_INDUSTRIES) {
      if (item.value !== brandIndustry && item.label !== brandIndustry) {
        list.push(item)
      }
    }
    return list
  }, [brandIndustry])

  return (
    <Field label="行业">
      <Select value={value || '__all__'} onValueChange={(nextValue) => onChange(nextValue === '__all__' ? '' : nextValue)}>
        <SelectTrigger>
          <SelectValue placeholder="选择行业（可选）" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">不限</SelectItem>
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/* ──────────── MiniStat ──────────── */

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-[var(--card)] px-2 py-2 text-center">
      <div className="num text-[14px] font-bold text-[var(--ink)]">{value}</div>
      <div className="text-[10px] text-[var(--ink-3)]">{label}</div>
    </div>
  )
}

/* ──────────── Section Title ──────────── */

function SectionTitle({ icon, title, meta }: { icon: ReactNode; title: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent-d)]">
          {icon}
        </span>
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2>
      </div>
      {meta && <span className="text-[12px] font-semibold text-[var(--ink-3)]">{meta}</span>}
    </div>
  )
}

/* ──────────── Comment Row (flat, bottom divider) ──────────── */

function CommentRow({
  comment,
  onAddLead,
  onIgnore,
}: {
  comment: DouyinImportedComment
  onAddLead: () => void
  onIgnore: () => void
}) {
  const publishedText = formatCommentTime(comment.publishedAt)

  return (
    <div className="py-4 first:pt-1">
      <div className="flex items-start gap-2.5">
        <Avatar text={comment.nickname} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--ink)]">{comment.nickname}</span>
            <span className="text-[11px] text-[var(--ink-3)]">@{comment.douyinId || '未知账号'}</span>
            <IntentBadge level={comment.analysis.level} />
            <span className="num text-[12px] font-semibold text-[var(--ink-2)]">{comment.analysis.score}/100</span>
            {publishedText && (
              <span className="text-[11px] text-[var(--ink-3)]">{publishedText}</span>
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink)]">{comment.content}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-[var(--line)] text-[var(--ink-2)]">关键词：{comment.keyword}</Badge>
            <Badge variant="secondary">赞 {comment.likes}</Badge>
            <Badge variant="secondary">回复 {comment.replyCount}</Badge>
            {comment.videoUrl && (
              <a
                href={comment.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--accent-d)] noopener hover:bg-[var(--accent-soft)]"
              >
                作品链接 <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {comment.analysis.demandKeywords.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
          </div>
          {comment.analysis.reason && (
            <p className="mt-2.5 rounded-[9px] bg-[var(--fill-tertiary)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
              AI 判断：{comment.analysis.reason}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onIgnore}>
          <EyeOff className="h-4 w-4" />
          忽略
        </Button>
        <Button size="sm" onClick={onAddLead} disabled={comment.isLead}>
          <UserPlus className="h-4 w-4" />
          {comment.isLead ? '已加入' : '加入客户库'}
        </Button>
      </div>
    </div>
  )
}

function LeadLibrary({
  leads,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onBatchSend,
  onStatusChange,
  onNoteBlur,
}: {
  leads: DouyinLead[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onBatchSend: () => void
  onStatusChange: (lead: DouyinLead, status: DouyinLeadStatus) => void
  onNoteBlur: (lead: DouyinLead, note: string) => void
}) {
  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.includes(l.id))

  return (
    <ContentCard padding="normal">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle icon={<Users className="h-4 w-4" />} title="潜在客户库" meta={`${leads.length} 人`} />
        <div className="flex items-center gap-2">
          {leads.length > 0 && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--ink-2)] select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="h-3.5 w-3.5 rounded-[3px] accent-[var(--accent)]"
              />
              全选
            </label>
          )}
          {selectedIds.length > 0 && (
            <Button size="sm" onClick={onBatchSend} className="h-7 gap-1 rounded-[8px] text-[11px]">
              <Send className="h-3 w-3" />
              批量发私信 ({selectedIds.length})
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {leads.length === 0 ? (
          <EmptyState title="暂无目标客户" description="从评论列表点击「加入客户库」即可将用户添加到这里。" compact />
        ) : leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            selected={selectedIds.includes(lead.id)}
            onToggleSelect={() => onToggleSelect(lead.id)}
            onStatusChange={(status) => onStatusChange(lead, status)}
            onNoteBlur={(note) => onNoteBlur(lead, note)}
          />
        ))}
      </div>
    </ContentCard>
  )
}

function LeadCard({
  lead,
  selected,
  onToggleSelect,
  onStatusChange,
  onNoteBlur,
}: {
  lead: DouyinLead
  selected: boolean
  onToggleSelect: () => void
  onStatusChange: (status: DouyinLeadStatus) => void
  onNoteBlur: (note: string) => void
}) {
  const [note, setNote] = useState(lead.note)

  useEffect(() => {
    setNote(lead.note)
  }, [lead.note])

  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--fill-quaternary)] p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1.5 h-4 w-4 shrink-0 rounded-[4px] accent-[var(--accent)] cursor-pointer"
        />
        <Avatar text={lead.nickname} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[var(--ink)]">{lead.nickname}</div>
              <div className="truncate text-[11px] text-[var(--ink-3)]">@{lead.douyinId || '未知账号'}</div>
            </div>
            <IntentBadge level={lead.level} />
          </div>

          <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[var(--ink-2)]">{lead.content}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-[var(--line)] text-[var(--ink-2)]">关键词：{lead.keyword || '未标记'}</Badge>
            <Badge variant="secondary">{lead.score}/100</Badge>
            {lead.sourceVideoUrl && (
              <a
                href={lead.sourceVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--accent-d)] hover:bg-[var(--accent-soft)]"
              >
                来源作品 <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {lead.demandKeywords.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
          </div>

          <Select value={lead.status} onValueChange={(value) => onStatusChange(value as DouyinLeadStatus)}>
            <SelectTrigger className="mt-3 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {leadStatusOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => onNoteBlur(note)}
            rows={3}
            className="mt-3 w-full resize-none rounded-[10px] border border-[var(--line)] bg-transparent px-3 py-2 text-[12px] outline-none focus:border-[var(--accent)]"
            placeholder="添加跟进备注"
          />
        </div>
      </div>
    </div>
  )
}

/* ──────────── Lead Card (flat, bottom divider) ──────────── */

/* ──────────── Log List (compact, no card borders) ──────────── */

/* ──────────── Pagination ──────────── */

function PaginationBar({
  page,
  onPageChange,
  itemLabel,
  className,
}: {
  page: PaginationMeta
  onPageChange: (page: number) => void
  itemLabel: string
  className?: string
}) {
  if (page.total === 0) return null

  return (
    <div className={cn('flex flex-col gap-3 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <p className="text-[12px] text-[var(--ink-3)]">
        第 {page.start + 1}-{page.end} 条，共 {page.total} 条{itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onPageChange(page.current - 1)} disabled={page.current <= 1}>
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <span className="num min-w-16 text-center text-[12px] font-semibold text-[var(--ink-2)]">
          {page.current} / {page.pages}
        </span>
        <Button size="sm" variant="outline" onClick={() => onPageChange(page.current + 1)} disabled={page.current >= page.pages}>
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function TaskListPager({ page, onPageChange }: { page: PaginationMeta; onPageChange: (page: number) => void }) {
  if (page.total === 0) return null

  const nextPage = page.current >= page.pages ? 1 : page.current + 1
  return (
    <button
      type="button"
      onClick={() => onPageChange(nextPage)}
      className="mt-4 flex h-10 w-full items-center justify-center gap-1 text-[13px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)]"
    >
      查看全部任务
      <ChevronRight className="h-4 w-4" />
    </button>
  )
}

/* ──────────── Shared components ──────────── */

function Avatar({ text }: { text: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[12px] font-bold text-[var(--accent-d)]">
      {text.slice(0, 1).toUpperCase()}
    </span>
  )
}

function IntentBadge({ level }: { level: DouyinIntentLevel }) {
  const map: Record<DouyinIntentLevel, { label: string; className: string; icon: ReactNode }> = {
    high: { label: '高意向', className: 'bg-[rgba(111,168,56,0.12)] text-[var(--accent-d)] border-transparent', icon: <CheckCircle2 className="h-3 w-3" /> },
    medium: { label: '中意向', className: 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)] border-transparent', icon: <Clock3 className="h-3 w-3" /> },
    low: { label: '低意向', className: 'bg-[rgba(91,141,239,0.12)] text-[var(--blue)] border-transparent', icon: <MessageCircle className="h-3 w-3" /> },
    none: { label: '无明显意向', className: 'bg-[var(--fill-tertiary)] text-[var(--ink-3)] border-transparent', icon: <EyeOff className="h-3 w-3" /> },
  }
  const item = map[level]
  return <Badge variant="outline" className={cn('gap-1', item.className)}>{item.icon}{item.label}</Badge>
}

function StatusBadge({ status }: { status: DouyinTaskStatus }) {
  const classes: Record<DouyinTaskStatus, string> = {
    idle: 'bg-[var(--fill-tertiary)] text-[var(--ink-2)]',
    running: 'bg-[rgba(111,168,56,0.12)] text-[var(--accent-d)]',
    analyzing: 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)]',
    paused: 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)]',
    completed: 'bg-[rgba(91,141,239,0.12)] text-[var(--blue)]',
    executor_required: 'bg-[rgba(244,169,75,0.14)] text-[var(--orange)]',
    failed: 'bg-[rgba(229,106,90,0.12)] text-[var(--red)]',
  }
  return <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', classes[status])}>{statusLabel(status)}</span>
}

function statusLabel(status: DouyinTaskStatus) {
  const labels: Record<DouyinTaskStatus, string> = {
    idle: '待启动',
    running: '运行中',
    analyzing: 'AI 分析中',
    paused: '已暂停',
    completed: '已完成',
    executor_required: '待连接执行器',
    failed: '失败',
  }
  return labels[status]
}

function EmptyState({ title, description, compact = false, icon }: { title: string; description: string; compact?: boolean; icon?: ReactNode }) {
  return (
    <div className={cn('rounded-[14px] border border-dashed border-[var(--line)] text-center', compact ? 'p-5' : 'p-10')}>
      {icon && (
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--fill-tertiary)] text-[var(--ink-3)]">
          {icon}
        </div>
      )}
      <div className="text-[14px] font-semibold text-[var(--ink)]">{title}</div>
      <p className="mx-auto mt-1 max-w-[420px] text-[12px] leading-relaxed text-[var(--ink-3)]">{description}</p>
    </div>
  )
}

function formatTime(value?: string) {
  if (!value) return '暂无时间'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatCommentTime(value?: string) {
  if (!value) return ''
  try {
    const date = new Date(value)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin} 分钟前`
    if (diffHour < 24) return `${diffHour} 小时前`
    if (diffDay < 7) return `${diffDay} 天前`
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  } catch {
    return ''
  }
}

/* ──────────── Pagination helpers ──────────── */

interface PaginationMeta {
  total: number
  pages: number
  current: number
  start: number
  end: number
}

interface Paginated<T> extends PaginationMeta {
  items: T[]
}

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(page, 1), pages)
  const start = (current - 1) * pageSize
  const end = Math.min(start + pageSize, total)
  return {
    items: items.slice(start, end),
    total,
    pages,
    current,
    start,
    end,
  }
}
