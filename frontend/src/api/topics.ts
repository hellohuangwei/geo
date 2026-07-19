import apiClient from './client'

export interface TopicItem {
  id: number
  name: string
  enabled: boolean
  sceneQuestions: string[]
  createTime: string
}

export async function fetchTopicsApi(): Promise<TopicItem[]> {
  const res = await apiClient.get('/topics')
  return res.data as TopicItem[]
}

export async function createTopicApi(name: string): Promise<TopicItem> {
  const res = await apiClient.post('/topics', { name })
  return res.data as TopicItem
}

export async function updateTopicApi(id: number, data: {
  name?: string
  enabled?: boolean
  sceneQuestions?: string[]
}): Promise<TopicItem> {
  const res = await apiClient.put(`/topics/${id}`, data)
  return res.data as TopicItem
}

export async function toggleTopicApi(id: number): Promise<TopicItem> {
  const res = await apiClient.put(`/topics/${id}/toggle`)
  return res.data as TopicItem
}

export async function deleteTopicApi(id: number): Promise<void> {
  await apiClient.delete(`/topics/${id}`)
}

/** AI 生成场景问题 */
export async function generateSceneQuestionsApi(
  topicName: string,
  existing: string[],
): Promise<string[]> {
  const res = await apiClient.post('/topics/generate-questions', { topicName, existing })
  return res.data as string[]
}
