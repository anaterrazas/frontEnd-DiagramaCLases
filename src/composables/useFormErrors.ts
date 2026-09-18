// src/composables/useFormErrors.ts
import { ref } from 'vue'

export function useFormErrors() {
  const errors = ref<Record<string, string>>({})
  const formError = ref('')

  function handleBackendError(error: any) {
    errors.value = {}
    formError.value = ''

    const response = error.response?.data
    if (!response) {
      formError.value = 'Error de red o sin respuesta del servidor.'
      return
    }

    formError.value = response.message || 'Ocurrió un error'

    // Si viene como array de objetos: [{ field, message }]
    if (Array.isArray(response.errors)) {
      response.errors.forEach((err: { field: string; message: string }) => {
        errors.value[err.field] = err.message
      })
    }

    // Si viene como objeto: { email: [...], password: [...] }
    if (typeof response.errors === 'object' && !Array.isArray(response.errors)) {
      for (const [field, messages] of Object.entries(response.errors)) {
        if (Array.isArray(messages)) {
          errors.value[field] = messages[0] // Tomamos solo el primer error
        } else if (typeof messages === 'string') {
          errors.value[field] = messages
        }
      }
    }
  }


  function clearFieldError(field: string) {
    errors.value[field] = ''
  }

  return {
    errors,
    formError,
    handleBackendError,
    clearFieldError,
  }
}
