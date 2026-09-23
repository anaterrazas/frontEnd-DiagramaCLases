// src/core/uml/validation/index.ts

export type {
  UMLValidationSeverity,
  UMLValidationCode,
  UMLValidationIssue,
  UMLValidationResult,
} from './validation.types'

export { validateUmlModel } from './validateUmlModel'
export { validateUmlView } from './validateUmlView'
