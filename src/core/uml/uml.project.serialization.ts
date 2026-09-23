// src/core/uml/uml.project.serialization.ts
// Utilidades simples para guardar/cargar UMLProjectDocument como JSON.

import type { UMLModel } from './uml.model'
import { UML_APP_FORMAT_VERSION } from './uml.model'
import type { UMLDiagramView } from './uml.visual'
import type { UMLProjectDocument } from './uml.project'
import type { UMLValidationResult } from './validation'
import { validateUmlModel, validateUmlView } from './validation'

export interface CreateUmlProjectDocumentInput {
  id: string
  name: string
  model: UMLModel
  diagrams: UMLDiagramView[]
  activeDiagramId?: string
}

export interface UMLProjectDocumentValidationResult {
  valid: boolean
  model: UMLValidationResult
  diagrams: Array<{
    diagramId: string
    result: UMLValidationResult
  }>
}

export interface LoadUmlProjectDocumentResult {
  document?: UMLProjectDocument
  validation?: UMLProjectDocumentValidationResult
  error?: string
}

export function createUmlProjectDocument(input: CreateUmlProjectDocumentInput): UMLProjectDocument {
  return {
    id: input.id,
    name: input.name,
    formatVersion: UML_APP_FORMAT_VERSION,
    model: input.model,
    diagrams: input.diagrams,
    activeDiagramId: input.activeDiagramId,
  }
}

export function serializeUmlProjectDocument(document: UMLProjectDocument): string {
  return JSON.stringify(document, null, 2)
}

export function loadUmlProjectDocumentFromJson(json: string): LoadUmlProjectDocumentResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'JSON invalido.',
    }
  }

  if (!isUmlProjectDocumentLike(parsed)) {
    return {
      error: 'El JSON no tiene la estructura minima de UMLProjectDocument.',
    }
  }

  const document = parsed as UMLProjectDocument

  return {
    document,
    validation: validateUmlProjectDocument(document),
  }
}

export function validateUmlProjectDocument(document: UMLProjectDocument): UMLProjectDocumentValidationResult {
  const model = validateUmlModel(document.model)
  const diagrams = document.diagrams.map((diagram) => ({
    diagramId: diagram.id,
    result: validateUmlView(diagram, document.model),
  }))

  return {
    valid: model.valid && diagrams.every((diagram) => diagram.result.valid),
    model,
    diagrams,
  }
}

function isUmlProjectDocumentLike(value: unknown): value is UMLProjectDocument {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<UMLProjectDocument>

  return (
    typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.formatVersion === 'string'
    && typeof candidate.model === 'object'
    && candidate.model !== null
    && Array.isArray(candidate.diagrams)
    && (candidate.activeDiagramId === undefined || typeof candidate.activeDiagramId === 'string')
  )
}
