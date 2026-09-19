// src/core/uml/xmi/bridge/bridge.types.ts

import type { UMLProjectDocument } from '../../uml.project'
import type { UMLProjectDocumentValidationResult } from '../../uml.project.serialization'

export interface XmiBridgeExportOptions {
  pretty?: boolean
}

export interface XmiBridgeExportResult {
  xmi: string
  document: UMLProjectDocument
  warnings: string[]
  errors: string[]
  validation: UMLProjectDocumentValidationResult
}
