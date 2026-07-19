import apiClient from './client'

export interface ArticleGenerateParams {
  topic: string
  sceneQuestions: string[]
  product: string
  articleCount: number
  notes: string
}

export interface GeneratedArticle {
  id: number
  title: string
  summary: string
  content: string
  tags: string[]
  topic: string
  product: string
  sceneQuestions?: string[]
  notes?: string
  publishStatus?: Record<string, string>
  createTime: string
}

export interface PublishHistoryItem {
  articleId: number
  articleTitle: string
  platform: string
  platformLabel: string
  status: string
  publishTime: string
}

export interface GenerateResult {
  topic: string
  count: number
  articles: GeneratedArticle[]
}

/** 提交生成请求 */
export async function generateArticlesApi(
  params: ArticleGenerateParams,
): Promise<GenerateResult> {
  const body = {
    ...params,
    sceneQuestions: params.sceneQuestions.filter((q) => q.trim()),
  }
  const res = await apiClient.post<GenerateResult>('/articles/generate', body)
  return res.data as GenerateResult
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  size: number
  totalPages: number
}

/** 获取文章列表（分页） */
export async function fetchArticlesApi(
  page = 1,
  size = 10,
): Promise<PaginatedResult<GeneratedArticle>> {
  const res = await apiClient.get<PaginatedResult<GeneratedArticle>>(
    `/articles?page=${page}&size=${size}`,
  )
  return res.data as PaginatedResult<GeneratedArticle>
}

/** 获取文章详情 */
export async function fetchArticleApi(id: number): Promise<GeneratedArticle> {
  const res = await apiClient.get<GeneratedArticle>(`/articles/${id}`)
  return res.data as GeneratedArticle
}

/** 更新文章 */
export async function updateArticleApi(
  id: number,
  data: Partial<GeneratedArticle>,
): Promise<void> {
  await apiClient.put(`/articles/${id}`, data)
}

/** 单篇发布 */
export async function publishArticleApi(
  id: number,
  platforms: string[],
): Promise<void> {
  await apiClient.post(`/articles/${id}/publish`, { platforms })
}

/** 批量发布 */
export async function batchPublishApi(
  ids: number[],
  platforms: string[],
): Promise<void> {
  await apiClient.post('/articles/batch-publish', { ids, platforms })
}

/** 发布历史 */
export async function fetchPublishHistoryApi(): Promise<PublishHistoryItem[]> {
  const res =
    await apiClient.get<PublishHistoryItem[]>('/articles/publish-history')
  return res.data as PublishHistoryItem[]
}

/** AI 辅助编辑（流式），返回 token 和完整的 stream */
export function aiEditStreamApi(
  id: number,
  content: string,
  message: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const controller = new AbortController()
  const token = localStorage.getItem('auth-token')

  fetch(`/api/articles/${id}/ai-edit/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ content, message }),
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok || !response.body) {
      onError('请求失败')
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 事件以双换行分隔
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        if (!part.trim()) continue
        const eventType = part.match(/^event:(\w+)/m)?.[1]
        const dataMatch = part.match(/^data:(.*)$/m)
        const data = dataMatch ? dataMatch[1].trim() : ''

        if (eventType === 'token' && data) {
          onToken(data.replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r'))
        } else if (eventType === 'done') {
          onDone()
          return
        } else if (eventType === 'error') {
          onError(data || '未知错误')
          return
        }
      }
    }
    onDone()
  }).catch((err) => {
    if (err.name !== 'AbortError') onError(err.message)
  })

  return () => controller.abort()
}

/** 删除文章 */
export async function deleteArticleApi(id: number): Promise<void> {
  await apiClient.delete(`/articles/${id}`)
}

/** 批量删除文章 */
export async function batchDeleteArticlesApi(ids: number[]): Promise<void> {
  await apiClient.delete('/articles/batch', { data: { ids } })
}

/** 根据话题自动生成场景问题 */
export async function generateSceneQuestionsApi(topic: string): Promise<string[]> {
  const res = await apiClient.post<string[]>('/articles/scene-questions/generate', { topic })
  return Array.isArray(res.data) ? res.data : []
}
