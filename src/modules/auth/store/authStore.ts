import { defineStore } from 'pinia'
import { signIn, signUp } from '../services/authService'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    refreshToken: localStorage.getItem('refreshToken') || '',
    user: null as any
  }),
  actions: {
    async signIn(email: string, password: string) {
      try {
        const res = await signIn({ email, password })

        this.token = res.data.token
        this.refreshToken = res.data.refreshToken
        this.user = res.data.user

        localStorage.setItem('token', this.token)
        localStorage.setItem('refreshToken', this.refreshToken)
      } catch (error) {
        console.error('Login error:', error)
        throw error
      }
    },

    async signUp(nombre: string, email: string, password: string) {
      try {
        const res = await signUp({ nombre, email, password })

        this.token = res.data.token
        this.refreshToken = res.data.refreshToken
        this.user = res.data.user

        localStorage.setItem('token', this.token)
        localStorage.setItem('refreshToken', this.refreshToken)
      } catch (error) {
        console.error('Signup error:', error)
        throw error
      }
    },

    logout() {
      this.token = ''
      this.refreshToken = ''
      this.user = null

      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
    }
  }
})
