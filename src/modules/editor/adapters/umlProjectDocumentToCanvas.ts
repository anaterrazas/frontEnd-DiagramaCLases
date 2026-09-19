// src/modules/editor/adapters/umlProjectDocumentToCanvas.ts
// Adapter de alto nivel: UMLProjectDocument -> snapshot consumible por Canvas.

import type { UMLDiagramView, UMLProjectDocument } from '@/core/uml'
import { umlToCanvas } from './umlToCanvas'
import type { UmlToCanvasResult } from './types'

export function umlProjectDocumentToCanvas(document: UMLProjectDocument): UmlToCanvasResult {
  const view = selectDiagramView(document)

  return umlToCanvas(document.model, normalizeViewLinksForCanvas(view))
}

function selectDiagramView(document: UMLProjectDocument): UMLDiagramView {
  const activeView = document.activeDiagramId !== undefined
    ? document.diagrams.find((diagram) => diagram.id === document.activeDiagramId)
    : undefined

  return activeView ?? document.diagrams[0] ?? { id: 'uml-view', elements: [] }
}

function normalizeViewLinksForCanvas(view: UMLDiagramView): UMLDiagramView {
  const semanticIdByVisualId = new Map<string, string>()

  for (const element of view.elements) {
    semanticIdByVisualId.set(element.id, element.semanticElementId)
  }

  return {
    ...view,
    links: view.links?.map((link) => ({
      ...link,
      sourceElementId: semanticIdByVisualId.get(link.sourceElementId) ?? link.sourceElementId,
      targetElementId: semanticIdByVisualId.get(link.targetElementId) ?? link.targetElementId,
    })),
  }
}
