import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Database,
  FileText,
  Loader2,
  MessageCircle,
  Play,
  Search,
  Send,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
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
} from '@/types/douyinLead'
import { StatsGrid } from './components/StatsGrid'
import { ControlPanel } from './components/ControlPanel'
import { CommentRow } from './components/CommentRow'
import { LeadLibrary } from './components/LeadLibrary'
import { TaskCard } from './components/TaskCard'
import { PaginationBar, TaskListPager } from './components/PaginationBar'
import { EmptyState } from './components/EmptyState'
import { paginate, SectionTitle } from './components/utils'

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

