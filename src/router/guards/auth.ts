// src/router/guards/auth.ts
import type { RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
import { ensureValidAccessToken } from '@/modules/auth/services/authService'
import { useAuthStore } from '@/modules/auth/store/authStore'

export async function authGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  const auth = useAuthStore()

  const isPublic = to.meta.public === true
  if (isPublic) return next()

  try {
    await ensureValidAccessToken(45_000) // refresca si faltan <= 45s
    next()
  } catch {
    auth.logout()
    next({ name: 'Login', query: { redirect: to.fullPath } })
  }
}
