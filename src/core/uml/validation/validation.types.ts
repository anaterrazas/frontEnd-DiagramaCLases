// src/core/uml/validation/validation.types.ts
// Tipos compartidos para validacion pura del modelo UML.

export type UMLValidationSeverity = 'error' | 'warning'

export type UMLValidationCode =
  | 'DUPLICATE_ID'
  | 'EMPTY_ID'
  | 'MISSING_REFERENCE'
  | 'INVALID_MULTIPLICITY'

export interface UMLValidationIssue {
  severity: UMLValidationSeverity
  code: UMLValidationCode
  message: string
  elementId?: string
  path?: string
}

export interface UMLValidationResult {
  valid: boolean
  issues: UMLValidationIssue[]
}
