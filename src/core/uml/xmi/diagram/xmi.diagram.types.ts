// src/core/uml/xmi/diagram/xmi.diagram.types.ts

import type { UMLDiagramView } from '../../uml.visual'

export interface XmiDiagramExportOptions {
  pretty?: boolean
}

export interface XmiDiagramExportResult {
  xmi: string
  warnings: string[]
  errors: string[]
}

export type XmiDiagramView = UMLDiagramView
