import {
  fetchTasksApi,
  createTaskApi,
  updateTaskApi,
  deleteTaskApi,
  runTaskApi,
  runTaskStreamApi,
  pauseTaskApi,
  fetchCommentsApi,
  addLeadFromCommentApi,
  batchAddLeadsFromCommentsApi,
  batchSendMessagesApi,
  ignoreCommentApi,
  fetchLeadsApi,
  updateLeadApi,
  fetchLogsApi,
  fetchStatsApi,
  type AcquisitionTask,
  type CapturedComment,
  type AcquisitionLead,
  type AcquisitionRunLog,
  type StreamBatchEvent,
} from '@/api/acquisition'
import type {
  DouyinAcquisitionConfig,
  DouyinAcquisitionTask,
  DouyinCommentAnalysis,
  DouyinImportedComment,
  DouyinIntentLevel,
  DouyinLead,
  DouyinLeadStatus,
  DouyinLeadWorkspace,
  DouyinRunLog,
  DouyinStartResult,
} from '@/types/douyinLead'

// ===================== Config 默认值 =====================

const defaultConfig: DouyinAcquisitionConfig = {
  keyword: '',
  industry: '',
  targetCommentCount: 100,
  autoAddLeadLevels: ['high', 'medium'],
}

export function getDefaultDouyinConfig(): DouyinAcquisitionConfig {
  return JSON.parse(JSON.stringify(defaultConfig))
}

export function buildDouyinSearchUrl(keyword: string) {
  const q = encodeURIComponent(keyword.trim())
  return q ? `https://www.douyin.com/search/${q}?type=video` : 'https://www.douyin.com/'
}

// ===================== 转换函数 =====================

function taskEntityToUi(t: AcquisitionTask): DouyinAcquisitionTask {
  let config = defaultConfig
  try {
    const parsed = JSON.parse(t.configJson)
    config = normalizeConfig(parsed)
  } catch { /* keep default */ }
  return {
    id: String(t.id),
    name: t.name,
    status: (t.status as DouyinAcquisitionTask['status']) || 'idle',
    config,
    currentKeyword: t.currentKeyword || undefined,
    lastSearchUrl: t.lastSearchUrl || undefined,
    collectedVideoCount: t.collectedVideoCount,
    analyzedCommentCount: t.analyzedCommentCount,
    leadCount: t.leadCount,
    lastRunAt: t.lastRunAt || undefined,
    createdAt: t.createTime,
    updatedAt: t.updateTime,
  }
}

function commentEntityToUi(c: CapturedComment): DouyinImportedComment {
  let demandKeywords: string[] = []
  try { demandKeywords = JSON.parse(c.intentKeywordsJson || '[]') } catch { /* keep empty */ }

  const analysis: DouyinCommentAnalysis = {
    level: (c.intentLevel as DouyinCommentAnalysis['level']) || 'none',
    score: c.intentScore,
    reason: c.intentReason || '',
    demandKeywords,
  }

  return {
    id: String(c.id),
    taskId: String(c.taskId),
    videoId: c.platformVideoId || undefined,
    videoTitle: c.videoTitle || undefined,
    videoUrl: c.videoUrl || undefined,
    keyword: c.keyword || '',
    nickname: c.commenterNickname,
    douyinId: c.commenterPlatformId || '',
    avatarUrl: c.commenterAvatarUrl || undefined,
    content: c.content,
    publishedAt: c.publishedAt || '',
    likes: c.likes,
    replyCount: c.replyCount,
    analysis,
    isLead: c.isLead,
    ignored: c.isIgnored,
  }
}

function leadEntityToUi(l: AcquisitionLead): DouyinLead {
  let demandKeywords: string[] = []
  try { demandKeywords = JSON.parse(l.demandKeywordsJson || '[]') } catch { /* keep empty */ }

  return {
    id: String(l.id),
    taskId: String(l.taskId),
    commentId: l.commentId ? String(l.commentId) : '',
    videoId: undefined,
    sourceVideoTitle: l.sourceVideoTitle || undefined,
    sourceVideoUrl: l.sourceVideoUrl || undefined,
    keyword: l.keyword || '',
    nickname: l.nickname,
    douyinId: l.platformUserId || '',
    content: l.commentContent,
    level: (l.intentLevel as DouyinLead['level']) || 'medium',
    score: l.intentScore,
    demandKeywords,
    status: (l.status as DouyinLeadStatus) || 'new',
    note: l.note || '',
    createdAt: l.createTime,
    updatedAt: l.updateTime,
  }
}

function logEntityToUi(l: AcquisitionRunLog): DouyinRunLog {
  return {
    id: String(l.id),
    taskId: String(l.taskId),
    status: (l.status as DouyinRunLog['status']) || 'running',
    message: l.message,
    searchUrl: l.searchUrl || undefined,
    createdAt: l.createTime,
  }
}

// ===================== 导出的 Service 函数 =====================

export async function fetchDouyinLeadWorkspace(taskId?: string, commentPage = 0, searchText = ''): Promise<DouyinLeadWorkspace> {
  try {
    const [tasks, leads, stats] = await Promise.all([
      fetchTasksApi('douyin'),
      fetchLeadsApi(),
      fetchStatsApi(),
    ])

    const uiTasks = tasks.map(taskEntityToUi)

    const workspace: DouyinLeadWorkspace = {
      tasks: uiTasks,
      videos: [],
      comments: [],
      commentTotal: 0,
      commentPages: 0,
      commentPage: 0,
      leads: leads.map(leadEntityToUi),
      logs: [],
    }

    // 如果有任务，加载当前任务的评论和日志；未传 taskId 时默认加载最新任务
    const activeTask = taskId
      ? uiTasks.find((task) => task.id === taskId) ?? uiTasks[0]
      : uiTasks[0]
    if (activeTask) {
      const keyword = (activeTask.currentKeyword || activeTask.config.keyword || '').trim()
      const [commentsData, logs] = await Promise.all([
        fetchCommentsApi(Number(activeTask.id), commentPage, 50, keyword || undefined, searchText).catch(() => ({ items: [], total: 0, pages: 0, page: 0 })),
        fetchLogsApi(Number(activeTask.id)).catch(() => []),
      ])
      workspace.comments = (commentsData.items || []).map(commentEntityToUi)
      workspace.commentTotal = commentsData.total || 0
      workspace.commentPages = commentsData.pages || 0
      workspace.commentPage = commentsData.page || 0
      workspace.logs = logs.map(logEntityToUi)
    }

    return workspace
  } catch {
    // 如果 API 不可用，返回空 workspace
    return { tasks: [], videos: [], comments: [], commentTotal: 0, commentPages: 0, commentPage: 0, leads: [], logs: [] }
  }
}

export async function saveDouyinTask(input: {
  id?: string
  name: string
  config: DouyinAcquisitionConfig
}): Promise<DouyinAcquisitionTask> {
  const configJson = JSON.stringify(normalizeConfig(input.config))

  if (input.id) {
    const updated = await updateTaskApi(Number(input.id), {
      name: input.name,
      configJson,
    })
    return taskEntityToUi(updated)
  }

  const created = await createTaskApi({
    name: input.name || '抖音获客任务',
    platform: 'douyin',
    configJson,
  })
  return taskEntityToUi(created)
}

export async function startDouyinTask(
  taskId: string,
  keyword: string,
): Promise<{ ok: boolean; comments: DouyinImportedComment[]; commentCount: number; videoCount: number; captchaDetected: boolean; message: string; searchUrl: string }> {
  const returnUrl = typeof window !== 'undefined' ? window.location.href : undefined
  const result = await runTaskApi(Number(taskId), keyword, returnUrl)
  const rawComments = result.comments || []
  const comments: DouyinImportedComment[] = rawComments.map((c: any) => {
    const aiAnalysis = c.analysis || {}
    return {
      id: c.id ? String(c.id) : '',
      taskId,
      keyword: c.keyword || keyword,
      nickname: c.nickname || '抖音用户',
      douyinId: c.douyinId || '',
      avatarUrl: c.avatarUrl,
      content: c.content || '',
      publishedAt: c.publishedAt || '',
      likes: c.likes || 0,
      replyCount: c.replyCount || 0,
      videoUrl: c.videoUrl || '',
      videoTitle: c.videoTitle || '',
      analysis: {
        level: (aiAnalysis.level as DouyinIntentLevel) || 'none',
        score: Number(aiAnalysis.score) || 0,
        reason: String(aiAnalysis.reason || ''),
        demandKeywords: Array.isArray(aiAnalysis.demandKeywords) ? aiAnalysis.demandKeywords : [],
      },
      isLead: Boolean(c.isLead),
      ignored: false,
    }
  })
  return {
    ok: true,
    comments,
    commentCount: result.commentCount || comments.length,
    videoCount: result.videoCount || 0,
    captchaDetected: result.captchaDetected || false,
    message: result.message || '',
    searchUrl: result.searchUrl || '',
  }
}

export async function startDouyinTaskStream(
  taskId: string,
  keyword: string,
  onBatch: (comments: DouyinImportedComment[], accumulated: number, target: number) => void,
  onDone: (total: number, leads: number) => void,
  onError: (message: string) => void,
): Promise<AbortController> {
  return runTaskStreamApi(
    Number(taskId),
    keyword,
    (event) => {
      const comments: DouyinImportedComment[] = (event.comments || []).map((c: any) => {
        const analysis = c.analysis || {}
        return {
          id: c.id ? String(c.id) : '',
          taskId,
          keyword: c.keyword || keyword,
          nickname: c.nickname || '抖音用户',
          douyinId: c.douyinId || '',
          avatarUrl: c.avatarUrl,
          content: c.content || '',
          publishedAt: c.publishedAt || '',
          likes: c.likes || 0,
          replyCount: c.replyCount || 0,
          videoUrl: c.videoUrl || event.videoUrl || '',
          videoTitle: c.videoTitle || '',
          analysis: {
            level: (analysis.level as DouyinIntentLevel) || 'none',
            score: Number(analysis.score) || 0,
            reason: String(analysis.reason || ''),
            demandKeywords: Array.isArray(analysis.demandKeywords) ? analysis.demandKeywords : [],
          },
          isLead: Boolean(c.isLead),
          ignored: false,
        }
      })
      onBatch(comments, event.accumulated, event.target)
    },
    onDone,
    onError,
  )
}

export async function pauseDouyinTask(taskId: string): Promise<void> {
  await pauseTaskApi(Number(taskId))
}

export async function deleteDouyinTask(taskId: string): Promise<void> {
  await deleteTaskApi(Number(taskId))
}

export async function addLeadFromDouyinComment(commentId: string): Promise<DouyinLead | null> {
  try {
    const lead = await addLeadFromCommentApi(Number(commentId))
    return leadEntityToUi(lead)
  } catch {
    return null
  }
}

export async function batchAddLeadsFromDouyinComments(commentIds: string[]): Promise<DouyinLead[]> {
  const leads = await batchAddLeadsFromCommentsApi(commentIds.map(Number))
  return leads.map(leadEntityToUi)
}

export async function batchSendDouyinMessages(
  leadIds: string[],
  message: string,
): Promise<{ success: number; failed: number; results: Array<{ nickname: string; douyinId: string; ok: boolean; error?: string }> }> {
  return batchSendMessagesApi({ leadIds: leadIds.map(Number), message })
}

export async function ignoreDouyinComment(commentId: string): Promise<void> {
  await ignoreCommentApi(Number(commentId))
}

export async function updateDouyinLead(
  id: string,
  patch: Partial<Pick<DouyinLead, 'note' | 'status'>>,
): Promise<DouyinLead | null> {
  try {
    const lead = await updateLeadApi(Number(id), {
      status: patch.status,
      note: patch.note,
    })
    return leadEntityToUi(lead)
  } catch {
    return null
  }
}

export async function updateDouyinLeadStatus(
  id: string,
  status: DouyinLeadStatus,
): Promise<DouyinLead | null> {
  return updateDouyinLead(id, { status })
}

function normalizeConfig(input: unknown): DouyinAcquisitionConfig {
  const raw = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const levels = Array.isArray(raw.autoAddLeadLevels)
    ? raw.autoAddLeadLevels.filter((value): value is Exclude<DouyinIntentLevel, 'none'> =>
        value === 'high' || value === 'medium' || value === 'low',
      )
    : defaultConfig.autoAddLeadLevels

  return {
    ...raw,
    platform: typeof raw.platform === 'string' ? raw.platform : undefined,
    keyword: typeof raw.keyword === 'string' ? raw.keyword.trim() : '',
    industry: typeof raw.industry === 'string' ? raw.industry : '',
    targetCommentCount: Number.isFinite(Number(raw.targetCommentCount))
      ? Math.max(1, Number(raw.targetCommentCount))
      : defaultConfig.targetCommentCount,
    autoAddLeadLevels: levels,
  } as DouyinAcquisitionConfig
}
