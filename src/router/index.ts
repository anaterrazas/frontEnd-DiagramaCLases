// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import NotFound from '@/components/NotFound.vue'

import authRoutes from '@/modules/auth/routes'
import salasRoutes from '@/modules/sala/routes'
import editorRoutes from '@/modules/editor/routes'
import userSalasRoutes from '@/modules/userSala/routes'

import { ensureValidAccessToken } from '@/modules/auth/services/authService'
import { useAuthStore } from '@/modules/auth/store/authStore'

const routes = [
  // Pública (login/registro)
  {
    path: '/',
    component: AuthLayout,
    children: authRoutes,
    meta: { requiresAuth: false },
  },
  // Protegidas
  {
    path: '/salas',
    component: DefaultLayout,
    children: salasRoutes,        // Asegúrate que los paths hijos NO empiecen con "/"
    meta: { requiresAuth: true },
  },
  {
    path: '/editor',
    component: DefaultLayout,
    children: editorRoutes,
    meta: { requiresAuth: true },
  },
  {
    path: '/salas-compartidas',
    component: DefaultLayout,
    children: userSalasRoutes,
    meta: { requiresAuth: true },
  },
  { path: '/:pathMatch(.*)*', component: NotFound },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()

  // ¿Alguna de las rutas emparejadas requiere auth?
  const requiresAuth = to.matched.some(r => r.meta?.requiresAuth)

  // si va al login y ya está logueado → redirige a una página interna
  if ((to.path === '/sign-in' || to.name === 'Login') && (auth.token || localStorage.getItem('token'))) {
    return next('/salas') // o la que prefieras como home
  }

  if (!requiresAuth) return next()

  // rutas protegidas
  const token = auth.token || localStorage.getItem('token')
  if (!token) {
    return next({ path: '/sign-in', query: { redirect: to.fullPath } })
  }

  try {
    // refresh proactivo (evita 401 en backend)
    await ensureValidAccessToken(45_000) // refresca si al token le quedan ≤45s
    next()
  } catch {
    auth.logout()
    next({ path: '/sign-in', query: { redirect: to.fullPath } })
  }
})

export default router
