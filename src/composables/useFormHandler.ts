// src/composables/useFormHandler.ts
import { ref } from 'vue'
import { notify } from '@/utils/snackbar'
import { useFormErrors } from './useFormErrors'

export function useFormHandler(submitFn: () => Promise<void>, delay = 0) {
  const loading = ref(false)
  const { errors, formError, handleBackendError, clearFieldError } = useFormErrors()

  const submit = async () => {
    loading.value = true
    try {
      if (delay > 0) await new Promise(res => setTimeout(res, delay))
      await submitFn()
    } catch (err) {
      handleBackendError(err)
      notify(formError.value, 'error')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    errors,
    formError,
    clearFieldError,
    submit,
  }
}
