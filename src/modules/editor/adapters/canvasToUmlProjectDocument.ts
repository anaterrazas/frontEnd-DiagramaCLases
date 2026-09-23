// src/modules/editor/adapters/canvasToUmlProjectDocument.ts
// Adapter de alto nivel: Canvas snapshot -> UMLProjectDocument validado.

import type { UMLProjectDocument } from '@/core/uml'
import { createUmlProjectDocument } from '@/core/uml'
import type { UMLValidationResult } from '@/core/uml/validation'
import { validateUmlModel, validateUmlView } from '@/core/uml/validation'
import type { DiagramModel } from '@/modules/editor/services/canvas.engine'
import { canvasToUml } from './canvasToUml'
import type { AdapterWarning } from './types'

export interface CanvasSnapshotToUmlProjectDocumentOptions {
  documentId?: string
  documentName?: string
  modelId?: string
  viewId?: string
  activeDiagramId?: string
}

export interface CanvasSnapshotToUmlProjectDocumentResult {
  document: UMLProjectDocument
  modelValidation: UMLValidationResult
  viewValidation: UMLValidationResult
  warnings: AdapterWarning[]
}

export function canvasSnapshotToUmlProjectDocument(
  snapshot: DiagramModel,
  options: CanvasSnapshotToUmlProjectDocumentOptions = {},
): CanvasSnapshotToUmlProjectDocumentResult {
  const { model, view, warnings } = canvasToUml(snapshot, {
    modelId: options.modelId,
    viewId: options.viewId,
  })
  const diagrams = [view]
  const modelValidation = validateUmlModel(model)
  const viewValidation = validateUmlView(view, model)

  const document = createUmlProjectDocument({
    id: options.documentId ?? 'uml-project',
    name: options.documentName ?? model.name,
    model,
    diagrams,
    activeDiagramId: options.activeDiagramId ?? view.id,
  })

  return {
    document,
    modelValidation,
    viewValidation,
    warnings,
  }
}
