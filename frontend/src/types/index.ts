export interface User {
  id: number
  username: string
  realName: string | null
  phone: string | null
  email: string | null
  status: number
  role: string | null
  createTime: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface ApiResult<T = unknown> {
  code: number
  message: string
  data: T
}
