import apiClient from './client'
import type { LoginResponse, User } from '@/types'

export async function loginApi(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', {
    username,
    password,
  })
  return res.data as LoginResponse
}

export async function registerApi(data: {
  username: string
  password: string
  realName?: string
  phone?: string
  email?: string
}): Promise<null> {
  const res = await apiClient.post<null>('/auth/register', data)
  return res.data as null
}

export async function fetchMeApi(): Promise<User> {
  const res = await apiClient.get<User>('/auth/me')
  return res.data as User
}
