// src/utils/token.ts
import { jwtDecode } from 'jwt-decode'

export function isTokenExpired(token: string, marginInSeconds: number = 30): boolean {
  try {
    const decoded = jwtDecode<{ exp: number }>(token)
    const now = Date.now() / 1000
    return decoded.exp < now + marginInSeconds
  } catch {
    return true
  }
}
