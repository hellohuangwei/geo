import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器：自动附加 JWT
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：统一处理 {code, message, data}
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data as { code: number; message: string; data: unknown }
    if (body.code !== 200) {
      return Promise.reject(new ApiError(body.code, body.message))
    }
    response.data = body.data
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    const message =
      error.response?.data?.message || error.message || '网络请求失败'
    return Promise.reject(new ApiError(error.response?.status ?? 0, message))
  },
)

export class ApiError extends Error {
  public code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

export default apiClient
