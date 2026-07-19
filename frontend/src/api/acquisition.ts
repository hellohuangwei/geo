import apiClient from './client'
import { useAuthStore } from '@/stores/authStore'

// ===================== Types =====================

export interface AcquisitionTask {
  id: number
  userId: number
  name: string
  platform: string
  status: string // idle | running | paused | completed | failed
  configJson: string
  currentKeyword: string | null
  lastSearchUrl: string | null
  collectedVideoCount: number
  analyzedCommentCount: number
  leadCount: number
  lastRunAt: string | null
  createTime: string
  updateTime: string
}

export interface CapturedComment {
  id: number
  userId: number
  taskId: number
  platform: string
  platformVideoId: string | null
  videoUrl: string | null
  videoTitle: string | null
  videoAuthorName: string | null
  keyword: string | null
  commenterNickname: string
  commenterPlatformId: string | null
  commenterAvatarUrl: string | null
  content: string
  publishedAt: string | null
  likes: number
  replyCount: number
  intentLevel: string | null
  intentScore: number
  intentReason: string | null
  intentKeywordsJson: string | null
  isLead: boolean
  isIgnored: boolean
  createTime: string
  updateTime: string
}

export interface AcquisitionLead {
  id: number
  userId: number
  taskId: number
  commentId: number | null
  platform: string
  sourceVideoUrl: string | null
  sourceVideoTitle: string | null
  keyword: string | null
  nickname: string
  platformUserId: string | null
  commentContent: string
  intentLevel: string | null
  intentScore: number
  demandKeywordsJson: string | null
  status: string // new | pending | contacted | communicating | converted | invalid
  note: string | null
  createTime: string
  updateTime: string
}

export interface AcquisitionRunLog {
  id: number
  userId: number
  taskId: number
  status: string
  message: string
  searchUrl: string | null
  createTime: string
}

export interface AcquisitionStats {
  tasks: number
  running: number
  comments: number
  leads: number
  highLeads: number
}

export interface RunTaskResponse {
  executorConnected: boolean
  message: string
  taskId: number
  keyword: string
  searchUrl: string
  commentCount: number
  leadCount: number
  videoCount: number
  captchaDetected?: boolean
  progress: Array<{ time: string; type: string; msg: string }>
  comments: Array<{
    id?: number
    nickname: string
    douyinId: string
    avatarUrl?: string
    content: string
    publishedAt?: string
    likes: number
    replyCount: number
    keyword: string
    videoUrl: string
    videoTitle?: string
    isLead?: boolean
    analysis?: {
      level: string
      score: number
      reason: string
      demandKeywords: string[]
    }
  }>
}

// ===================== API Functions =====================

// --- Tasks ---
export async function fetchTasksApi(platform?: string): Promise<AcquisitionTask[]> {
  const params = platform ? { platform } : {}
  const res = await apiClient.get<AcquisitionTask[]>('/acquisition/tasks', { params })
  return res.data as AcquisitionTask[]
}

export async function createTaskApi(data: {
  name: string
  platform?: string
  configJson: string
}): Promise<AcquisitionTask> {
  const res = await apiClient.post<AcquisitionTask>('/acquisition/tasks', data)
  return res.data as AcquisitionTask
}

export async function updateTaskApi(taskId: number, data: {
  name?: string
  configJson?: string
}): Promise<AcquisitionTask> {
  const res = await apiClient.put<AcquisitionTask>(`/acquisition/tasks/${taskId}`, data)
  return res.data as AcquisitionTask
}

export async function deleteTaskApi(taskId: number): Promise<void> {
  await apiClient.delete(`/acquisition/tasks/${taskId}`)
}

export async function runTaskApi(taskId: number, keyword?: string, returnUrl?: string): Promise<RunTaskResponse> {
  const res = await apiClient.post<RunTaskResponse>(`/acquisition/tasks/${taskId}/run`, { keyword, returnUrl })
  return res.data as RunTaskResponse
}

export interface StreamBatchEvent {
  batch: number
  videoUrl: string
  comments: RunTaskResponse['comments']
  accumulated: number
  target: number
  totalSaved: number
  totalLeads: number
  done: boolean
}

export async function runTaskStreamApi(
  taskId: number,
  keyword: string,
  onBatch: (event: StreamBatchEvent) => void,
  onDone: (total: number, leads: number) => void,
  onError: (message: string) => void,
): Promise<AbortController> {
  const abort = new AbortController()
  const token = useAuthStore.getState().token

  const url = `/api/acquisition/tasks/${taskId}/run-stream?keyword=${encodeURIComponent(keyword)}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Accept': 'text/event-stream',
    },
    signal: abort.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    onError(text || `HTTP ${response.status}`)
    return abort
  }

  const reader = response.body?.getReader()
  if (!reader) {
    onError('Stream not supported')
    return abort
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let doneNotified = false

  function parseSseEvents(chunk: string) {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    let eventName = ''
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (!data) continue
        try {
          const parsed = JSON.parse(data)
          if (eventName === 'batch') {
            onBatch(parsed as StreamBatchEvent)
          } else if (eventName === 'done' || eventName === 'complete') {
            if (!doneNotified) {
              doneNotified = true
              onDone(parsed.totalSaved || parsed.total || 0, parsed.totalLeads || 0)
            }
          } else if (eventName === 'error') {
            onError(parsed.message || '未知错误')
          }
        } catch {
          // skip unparseable events
        }
        eventName = ''
      }
    }
  }

  // Read loop
  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parseSseEvents(decoder.decode(value, { stream: true }))
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        onError(e.message || 'Stream error')
      }
    }
  })()

  return abort
}

export async function pauseTaskApi(taskId: number): Promise<void> {
  await apiClient.post(`/acquisition/tasks/${taskId}/pause`)
}

// --- Comments ---
export interface PagedCommentsResponse {
  items: CapturedComment[]
  total: number
  pages: number
  page: number
}

export async function fetchCommentsApi(taskId: number, page = 0, size = 50, keyword?: string, search?: string): Promise<PagedCommentsResponse> {
  const res = await apiClient.get<PagedCommentsResponse>(`/acquisition/tasks/${taskId}/comments`, {
    params: { page, size, ...(keyword ? { keyword } : {}), ...(search ? { search } : {}) },
  })
  return res.data as PagedCommentsResponse
}

export async function addLeadFromCommentApi(commentId: number): Promise<AcquisitionLead> {
  const res = await apiClient.post<AcquisitionLead>(`/acquisition/comments/${commentId}/add-lead`)
  return res.data as AcquisitionLead
}

export async function batchAddLeadsFromCommentsApi(commentIds: number[]): Promise<AcquisitionLead[]> {
  const res = await apiClient.post<AcquisitionLead[]>('/acquisition/batch-add-leads', { commentIds })
  return res.data as AcquisitionLead[]
}

export async function ignoreCommentApi(commentId: number): Promise<void> {
  await apiClient.post(`/acquisition/comments/${commentId}/ignore`)
}

export interface AnalyzeCommentsResponse {
  comments: Array<{
    nickname: string
    content: string
    analysis: {
      level: string
      score: number
      reason: string
      demandKeywords: string[]
    }
    [key: string]: any
  }>
}

export async function analyzeCommentsApi(data: {
  comments: Array<Record<string, any>>
  keyword?: string
  industry?: string
}): Promise<AnalyzeCommentsResponse> {
  const res = await apiClient.post<AnalyzeCommentsResponse>('/acquisition/comments/analyze', data)
  return res.data as AnalyzeCommentsResponse
}

// --- Leads ---
export async function fetchLeadsApi(taskId?: number): Promise<AcquisitionLead[]> {
  const params = taskId ? { taskId } : {}
  const res = await apiClient.get<AcquisitionLead[]>('/acquisition/leads', { params })
  return res.data as AcquisitionLead[]
}

export async function updateLeadApi(leadId: number, data: {
  status?: string
  note?: string
}): Promise<AcquisitionLead> {
  const res = await apiClient.put<AcquisitionLead>(`/acquisition/leads/${leadId}`, data)
  return res.data as AcquisitionLead
}

// --- Logs ---
export async function fetchLogsApi(taskId: number): Promise<AcquisitionRunLog[]> {
  const res = await apiClient.get<AcquisitionRunLog[]>(`/acquisition/tasks/${taskId}/logs`)
  return res.data as AcquisitionRunLog[]
}

// --- Stats ---
export async function fetchStatsApi(): Promise<AcquisitionStats> {
  const res = await apiClient.get<AcquisitionStats>('/acquisition/stats')
  return res.data as AcquisitionStats
}

// --- Batch send messages ---
export interface BatchSendMessagesResult {
  success: number
  failed: number
  results: Array<{ nickname: string; douyinId: string; ok: boolean; error?: string }>
}

export async function batchSendMessagesApi(data: {
  leadIds: number[]
  message: string
}): Promise<BatchSendMessagesResult> {
  const res = await apiClient.post<BatchSendMessagesResult>('/acquisition/leads/send-messages', data)
  return res.data as BatchSendMessagesResult
}
