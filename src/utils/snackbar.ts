import { useSnackbarStore } from '@/store/snackbarStore'
import { getActivePinia } from 'pinia'

export function notify(message: string, color: string = 'success') {
  const pinia = getActivePinia()
  if (pinia) {
    const snackbar = useSnackbarStore(pinia)
    snackbar.show(message, color)
  } else {
    console.warn('Pinia no está activo. ¿Se llamó antes de que la app se montara?')
  }
}
