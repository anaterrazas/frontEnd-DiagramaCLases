// src/modules/editor/types/uml-classic.ts
export type UMLVisibility = '+' | '-' | '#' | '~'

export interface UMLAttr {
  vis: UMLVisibility
  name: string
  type: string
  id?: string
}

export interface UMLMethod {
  vis: UMLVisibility
  name: string        // ej: "login()" (si quieres luego separas params)
  returnType: string  // '' o 'void' o lo que sea
  id?: string
}
