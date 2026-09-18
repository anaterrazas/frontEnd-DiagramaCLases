// src/core/socket/socket.ts

import { Socket } from 'socket.io-client'

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

// Eventos que el servidor envía al cliente
export interface ServerToClientEvents {
  init: (data: any) => void
  message: (msg: string) => void
  actualizarProyecto: (data: any) => void
  usuarioConectado: (data: { correo: string; mensaje: string }) => void
  usuarioDesconectado: (data: { correo: string; mensaje: string }) => void
}

// Eventos que el cliente envía al servidor
export interface ClientToServerEvents {
  joinRoom: (data: { salaId: string }) => void
  guardarProyecto: (data: any) => void
}

// Tipado global del socket
export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>
