export type DouyinIntentLevel = 'high' | 'medium' | 'low' | 'none'
export type DouyinLeadStatus = 'new' | 'pending' | 'contacted' | 'communicating' | 'converted' | 'invalid'
export type DouyinTaskStatus = 'idle' | 'running' | 'analyzing' | 'paused' | 'completed' | 'executor_required' | 'failed'
export type DouyinRunStatus = 'running' | 'analyzing' | 'completed' | 'executor_required' | 'failed'

export interface DouyinAcquisitionConfig {
  platform?: string // douyin, xiaohongshu, kuaishou
  keyword: string
  industry: string
  targetCommentCount: number
  autoAddLeadLevels: Exclude<DouyinIntentLevel, 'none'>[]
}

export interface DouyinAcquisitionTask {
  id: string
  name: string
  status: DouyinTaskStatus
  config: DouyinAcquisitionConfig
  currentKeyword?: string
  lastSearchUrl?: string
  collectedVideoCount: number
  analyzedCommentCount: number
  leadCount: number
  lastRunAt?: string
  createdAt: string
  updatedAt: string
}

export interface DouyinRunLog {
  id: string
  taskId: string
  status: DouyinRunStatus
  message: string
  searchUrl?: string
  createdAt: string
}

export interface DouyinVideoRecord {
  id: string
  taskId: string
  keyword: string
  url: string
  title: string
  authorName?: string
  createdAt: string
}

export interface DouyinCommentAnalysis {
  level: DouyinIntentLevel
  score: number
  reason: string
  demandKeywords: string[]
}

export interface DouyinImportedComment {
  id: string
  taskId: string
  videoId?: string
  videoTitle?: string
  videoUrl?: string
  keyword: string
  nickname: string
  douyinId: string
  avatarUrl?: string
  content: string
  publishedAt: string
  likes: number
  replyCount: number
  analysis: DouyinCommentAnalysis
  isLead: boolean
  ignored: boolean
}

export interface DouyinLead {
  id: string
  taskId: string
  commentId: string
  videoId?: string
  sourceVideoTitle?: string
  sourceVideoUrl?: string
  keyword: string
  nickname: string
  douyinId: string
  content: string
  level: Exclude<DouyinIntentLevel, 'none'>
  score: number
  demandKeywords: string[]
  status: DouyinLeadStatus
  note: string
  createdAt: string
  updatedAt: string
}

export interface DouyinLeadWorkspace {
  tasks: DouyinAcquisitionTask[]
  videos: DouyinVideoRecord[]
  comments: DouyinImportedComment[]
  commentTotal: number
  commentPages: number
  commentPage: number
  leads: DouyinLead[]
  logs: DouyinRunLog[]
}

export interface DouyinExecutorComment {
  keyword: string
  videoUrl?: string
  videoTitle?: string
  authorName?: string
  nickname: string
  douyinId?: string
  avatarUrl?: string
  content: string
  publishedAt?: string
  likes?: number
  replyCount?: number
}

export interface DouyinExecutorRunResponse {
  executorConnected: boolean
  message: string
  steps: string[]
  comments: DouyinExecutorComment[]
}

export interface DouyinStartResult {
  ok: boolean
  executorConnected: boolean
  message: string
  searchUrl: string
  steps: string[]
}
