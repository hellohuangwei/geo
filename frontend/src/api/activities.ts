import apiClient from './client'

export interface ActivityItem {
  activityType: string
  done: boolean
  title: string
  description: string
  createTime: string
  targetId: number | null
}

export async function fetchActivitiesApi(): Promise<ActivityItem[]> {
  const res = await apiClient.get<ActivityItem[]>('/activities')
  return res.data as ActivityItem[]
}
