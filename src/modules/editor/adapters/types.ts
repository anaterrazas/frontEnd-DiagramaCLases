// src/modules/editor/adapters/types.ts
// Tipos públicos de la capa de adaptación Canvas ↔ UMLModel.

import type { UMLModel, UMLDiagramView } from '@/core/uml'
import type { DiagramModel } from '@/modules/editor/services/canvas.engine'

/**
 * Aviso de pérdida controlada o transformación ambigua durante la conversión.
 * No es un error: la conversión sigue siendo válida.
 */
export interface AdapterWarning {
  code: string
  message: string
  /** Id del elemento implicado (clase, link, classifier…), si aplica. */
  targetId?: string
}

/** Resultado de Canvas → UMLModel. */
export interface CanvasToUmlResult {
  model: UMLModel
  view: UMLDiagramView
  warnings: AdapterWarning[]
}

/** Resultado de UMLModel → Canvas (estructura que el engine puede consumir). */
export interface UmlToCanvasResult {
  model: DiagramModel
  warnings: AdapterWarning[]
}