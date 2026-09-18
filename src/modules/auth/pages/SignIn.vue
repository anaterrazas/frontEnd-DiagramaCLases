<template>
  <div>
    <h2>Iniciar sesión</h2>

    <form @submit.prevent="submit">
      <BaseInput v-model="email" label="Correo electrónico" id="email" placeholder="example@gmail.com"
        :error="errors.email" type="email" @input="clearFieldError('email')" />

      <BaseInput v-model="password" label="Contraseña" id="contraseña" placeholder="Contraseña" :error="errors.password"
        type="password" @input="clearFieldError('password')" />


      <BaseButton :loading="loading" type="submit" text="Ingresar" icon="fas fa-sign-in-alt" iconPosition="right" />

      <div style="display: flex; justify-content: flex-end; margin-top: 0.75rem;">
        <router-link to="/sign-up">Ir al Registro</router-link>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/modules/auth/store/authStore'

import { useFormHandler } from '@/composables/useFormHandler'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')

const {
  loading,
  errors,
  formError,
  clearFieldError,
  submit,
} = useFormHandler(async () => {
  await auth.signIn(email.value, password.value)
  router.push('/salas')
}, 2000)
</script>

<style scoped>
form {
  display: flex;
  flex-direction: column;
}
</style>
