// src/core/uml/xmi/xmi.types.ts

import type { UMLValidationResult } from '../validation'

export interface XmiExportOptions {
  pretty?: boolean
}

export interface XmiExportResult {
  xmi: string
  warnings: string[]
  validation: UMLValidationResult
}
