// src/store/snackbarStore.ts
import { defineStore } from 'pinia'

interface SnackbarItem {
  id: number
  message: string
  color: string
  timeout: number
}

let nextId = 1

export const useSnackbarStore = defineStore('snackbar', {
  state: () => ({
    queue: [] as SnackbarItem[]
  }),
  actions: {
    show(message: string, color = 'success', timeout = 3000) {
      const id = nextId++
      const snackbar: SnackbarItem = { id, message, color, timeout }
      this.queue.unshift(snackbar)

      // Eliminar automáticamente después del timeout
      setTimeout(() => {
        this.queue = this.queue.filter(item => item.id !== id)
      }, timeout)
    }
  }
})
