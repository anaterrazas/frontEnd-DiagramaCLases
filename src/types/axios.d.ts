// src/types/axios.d.ts
import 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    _retry?: boolean
    skipAuth?: boolean
  }
  interface InternalAxiosRequestConfig {
    _retry?: boolean
    skipAuth?: boolean
  }
}
