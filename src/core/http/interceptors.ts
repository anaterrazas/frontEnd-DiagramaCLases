// src/core/http/interceptors.ts
import type { AxiosInstance } from 'axios'
import { refreshAccessToken } from '@/modules/auth/services/authService'
import { useAuthStore } from '@/modules/auth/store/authStore'
import { handleApiError } from './error-handler'

export function setupInterceptors(client: AxiosInstance) {
  // Añade Bearer salvo que pidamos saltarlo
  client.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token')
      if (token && !config.skipAuth) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => Promise.reject(error)
  )

  let isRefreshing = false
  let refreshPromise: Promise<string> | null = null

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config || {}
      const status = error?.response?.status
      const url: string = originalRequest.url || ''
      const isRefreshCall = url.includes('/auth/refresh-token')

      if (status === 401 && !originalRequest._retry && !isRefreshCall) {
        originalRequest._retry = true
        try {
          if (!isRefreshing) {
            isRefreshing = true
            refreshPromise = (async () => {
              const { accessToken, refreshToken } = await refreshAccessToken()
              const auth = useAuthStore()
              auth.token = accessToken
              localStorage.setItem('token', accessToken)
              if (refreshToken) {
                auth.refreshToken = refreshToken
                localStorage.setItem('refreshToken', refreshToken)
              }
              return accessToken
            })()
            await refreshPromise
          } else {
            await refreshPromise
          }

          const newToken = localStorage.getItem('token')!
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return client(originalRequest)
        } catch (e) {
          useAuthStore().logout()
          return Promise.reject(e)
        } finally {
          isRefreshing = false
          refreshPromise = null
        }
      }

      handleApiError(error)
      return Promise.reject(error)
    }
  )
}
