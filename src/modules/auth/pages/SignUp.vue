<template>
  <div>
    <h2>Registrate</h2>

    <form @submit.prevent="submit">
      <BaseInput v-model="nombre" label="Nombre" id="nombre" placeholder="Matias Franco Ramos" :error="errors.nombre"
        type="text" />

      <BaseInput v-model="email" label="Correo electrónico" id="email" placeholder="example@gmail.com"
        :error="errors.email" type="email" />

      <BaseInput v-model="password" label="Contraseña" id="contraseña" placeholder="Contraseña" :error="errors.password"
        type="password" />

      <BaseButton :loading="loading" type="submit" text="Registrar" icon="fas fa-user-plus" iconPosition="right" />

      <div style="display: flex; justify-content: flex-end; margin-top: 0.75rem;">
        <router-link to="/sign-in">Ir al Login</router-link>
      </div>

    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../store/authStore'
import { notify } from '@/utils/snackbar'
import { useFormErrors } from '@/composables/useFormErrors'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
const auth = useAuthStore()
const email = ref('')
const nombre = ref('')
const password = ref('')
const loading = ref(false) // ← NUEVO

const {
  errors,
  formError,
  handleBackendError,
} = useFormErrors()

async function submit() {
  loading.value = true // ← Activar loading
  try {
    await new Promise(resolve => setTimeout(resolve, 2000))
    await auth.signUp(nombre.value, email.value, password.value)
    router.push('/salas')
  } catch (error: any) {
    handleBackendError(error)
    notify(formError.value, 'error')
  } finally {
    loading.value = false // ← Desactivar loading
  }
}
</script>

<style scoped>
form {
  display: flex;
  flex-direction: column;
}
</style>
