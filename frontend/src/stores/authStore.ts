import { create } from 'zustand'
import { loginApi, fetchMeApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import type { User } from '@/types'

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean

  login: (username: string, password: string) => Promise<void>
  logout: () => void
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('auth-token'),
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (username: string, password: string) => {
    const { token, user } = await loginApi(username, password)
    localStorage.setItem('auth-token', token)
    set({ token, user, isAuthenticated: true, isLoading: false })
  },

  logout: () => {
    localStorage.removeItem('auth-token')
    set({ token: null, user: null, isAuthenticated: false, isLoading: false })
  },

  initialize: async () => {
    const token = get().token
    if (!token) {
      set({ isLoading: false, isAuthenticated: false })
      return
    }
    try {
      const user = await fetchMeApi()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (e) {
      if (e instanceof ApiError && e.code === 401) {
        localStorage.removeItem('auth-token')
      }
      set({ token: null, user: null, isAuthenticated: false, isLoading: false })
    }
  },
}))
