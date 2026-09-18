import { defineStore } from 'pinia'
import { getAll, create, update, del } from '@/modules/sala/services/salaService'

export const useSalaStore = defineStore('sala', {
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
    async createSala(title: string, descripcion: string) {
      this.loading = true
      try {
        await create({ title, descripcion })

      } catch (error) {
        console.error('Error al cargar salas:', error)
      } finally {
        this.loading = false
      }
    },
    async updateSala(id: number, title: string, descripcion: string) {
      this.loading = true
      try {
        await update({ title, descripcion }, id)

      } catch (error) {
        console.error('Error al cargar salas:', error)
      } finally {
        this.loading = false
      }
    },
    async deleteSala(id: number) {
      this.loading = true
      try {
        await del(id)

      } catch (error) {
        console.error('Error al cargar salas:', error)
      } finally {
        this.loading = false
      }
    }
  }
})
