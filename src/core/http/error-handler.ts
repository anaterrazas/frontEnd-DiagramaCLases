// src/core/http/error-handler.ts
import type { AxiosError } from 'axios';

export function handleApiError(error: AxiosError) {
  const status = error.response?.status;

  switch (status) {
    case 401:
      console.warn('No autorizado. Redirigiendo al login...');
      // Redirige o limpia sesión
      break;

    case 403:
      console.warn('Acceso denegado.');
      break;

    case 404:
      console.warn('Recurso no encontrado.');
      break;

    default:
      console.error('Error inesperado:', error.message);
  }
}
