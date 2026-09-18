// src/auth/services/authService.ts
import client from '@/core/http/client'
import { jwtDecode } from 'jwt-decode' // ✅


type TokensResp = { accessToken: string; refreshToken?: string }
type LoginResp = { accessToken: string; refreshToken: string; user?: any }
type RegisterResp = { id: number; nombre: string; correo: string } // ajusta a tu API

export async function signIn(data: { email: string; password: string }) {
  const res = await client.post('/auth/login', data, {  skipAuth: true })
  console.log(res.data)
  return res.data 
}

export async function signUp(data: { nombre: string; email: string; password: string }) {
  const res = await client.post('/auth/register', data, { skipAuth: true })
  return res.data 
}

export async function refreshAccessToken(): Promise<TokensResp> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) throw new Error('No refresh token found')

  const res = await client.post(
    '/auth/refresh-token',
    { refreshToken },
    { skipAuth: true } // 👈 importantísimo
  )
  return res.data.data as TokensResp
}

/** Refresca si al token le quedan <= thresholdMs (por defecto 45s) */
export async function ensureValidAccessToken(thresholdMs = 45_000) {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('No access token')

  const { exp } = jwtDecode<{ exp: number }>(token) // segundos UNIX
  const msLeft = exp * 1000 - Date.now()
  if (msLeft <= thresholdMs) {
    const { accessToken, refreshToken } = await refreshAccessToken()
    localStorage.setItem('token', accessToken)
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
    return accessToken
  }
  return token
}
