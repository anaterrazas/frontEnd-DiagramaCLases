import { defineStore } from 'pinia'
import { getAll, del, share } from '@/modules/userSala/services/userSalaService'


export const useUserSalaStore = defineStore('userSala', {
  state: () => ({
    salas: [] as any[],
    loading: false
  }),

  actions: {
    async getSalas() {
      this.loading = true
      try {
        const res = await getAll()
        this.salas = res.data
      } catch (error) {
        console.error('Error al cargar salas:', error)
      } finally {
        this.loading = false
      }
    },
    async delete(salaId: number) {
      this.loading = true
      try {
        await del(salaId)
      } catch (error) {
        console.error('Error al cargar salas:', error)
      } finally {
        this.loading = false
      }
    },
    async share(salaId: number) {
      this.loading = true
      try {
        await share(salaId)
      } catch (error) {
        console.error('Error al cargar salas:', error)
      } finally {
        this.loading = false
      }
    }
  }
})
