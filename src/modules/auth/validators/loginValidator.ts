// src/validators/loginValidator.ts
export interface LoginData {
  email: string
  password: string
}

export function validateLogin(data: LoginData): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!data.email) {
    errors.email = 'Correo obligatorio'
  } else if (!data.email.includes('@')) {
    errors.email = 'Correo inválido'
  }

  if (!data.password) {
    errors.password = 'Contraseña obligatoria'
  } else if (data.password.length < 6) {
    errors.password = 'Debe tener al menos 6 caracteres'
  }

  return errors
}
