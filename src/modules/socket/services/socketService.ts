import { io } from 'socket.io-client'
import { SOCKET_URL, TypedSocket } from '@/core/socket/socket'
import { useAuthStore } from '@/modules/auth/store/authStore'
import { refreshAccessToken } from '@/modules/auth/services/authService'
import { isTokenExpired } from '@/utils/token'

let socket: TypedSocket | null = null

/**
 * Conecta al socket, renovando el token si está expirado.
 */
export async function connectSocket(): Promise<TypedSocket | null> {
  const authStore = useAuthStore()
  let token = authStore.token

  // Verifica si el token está expirado o por expirar
  if (isTokenExpired(token, 60)) {
    try {
      const data = await refreshAccessToken()
      token = data.accessToken
      authStore.token = token
      localStorage.setItem('token', token)

      if (data.refreshToken) {
        authStore.refreshToken = data.refreshToken
        localStorage.setItem('refreshToken', data.refreshToken)
      }

      console.info('[Socket] Token renovado antes de conectar')
    } catch (err) {
      console.error('[Socket] Error al renovar token antes del socket')
      return null
    }
  }

  // Crear socket
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: false,
  })

  // Conectar
  socket.connect()

  return socket
}

/**
 * Devuelve la instancia actual del socket.
 */
export function getSocket(): TypedSocket | null {
  return socket
}

/**
 * Desconecta y elimina todos los listeners del socket.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    console.info('[Socket] Desconectado correctamente')
  }
}
