// src/core/uml/xmi/bridge/importXmiToDrawSchema.ts

import type { UMLModel } from '../../uml.model'
import type { UMLProjectDocument } from '../../uml.project'
import {
  createUmlProjectDocument,
  validateUmlProjectDocument,
} from '../../uml.project.serialization'
import type { UMLDiagramView } from '../../uml.visual'
import { importXmiToUmlModel } from '../importXmiToUml'

export interface XmiBridgeImportOptions {
  documentId?: string
  documentName?: string
  viewId?: string
  viewName?: string
}

export interface XmiBridgeImportResult {
  document?: UMLProjectDocument
  model?: UMLModel
  diagrams: UMLDiagramView[]
  warnings: string[]
  errors: string[]
  validation?: ReturnType<typeof validateUmlProjectDocument>
}

const GRID_COLUMNS = 4
const GRID_ORIGIN_X = 40
const GRID_ORIGIN_Y = 40
const GRID_COLUMN_GAP = 240
const GRID_ROW_GAP = 180
const SYNTHETIC_ELEMENT_WIDTH = 180
const SYNTHETIC_ELEMENT_HEIGHT = 100

export function importXmiToDrawSchema(
  xmi: string,
  options: XmiBridgeImportOptions = {},
): XmiBridgeImportResult {
  const importResult = importXmiToUmlModel(xmi)

  if (importResult.model === undefined) {
    return {
      diagrams: [],
      warnings: importResult.warnings,
      errors: importResult.errors,
    }
  }

  const model = importResult.model
  const view = createSyntheticView(model, options)
  const document = createUmlProjectDocument({
    id: options.documentId ?? `${model.id}-project`,
    name: options.documentName ?? model.name,
    model,
    diagrams: [view],
    activeDiagramId: view.id,
  })
  const validation = validateUmlProjectDocument(document)

  return {
    document,
    model,
    diagrams: document.diagrams,
    warnings: [
      ...importResult.warnings,
      'La geometria de la vista fue generada sinteticamente; las posiciones originales no fueron importadas.',
      ...validationWarnings(validation),
    ],
    errors: [
      ...importResult.errors,
      ...validationErrors(validation),
    ],
    validation,
  }
}

function createSyntheticView(model: UMLModel, options: XmiBridgeImportOptions): UMLDiagramView {
  return {
    id: options.viewId ?? `${model.id}-view`,
    name: options.viewName ?? 'Vista importada',
    elements: model.classifiers.map((classifier, index) => ({
      id: `view-element-${classifier.id}`,
      semanticElementId: classifier.id,
      x: GRID_ORIGIN_X + (index % GRID_COLUMNS) * GRID_COLUMN_GAP,
      y: GRID_ORIGIN_Y + Math.floor(index / GRID_COLUMNS) * GRID_ROW_GAP,
      width: SYNTHETIC_ELEMENT_WIDTH,
      height: SYNTHETIC_ELEMENT_HEIGHT,
    })),
    links: [],
  }
}

function validationWarnings(validation: ReturnType<typeof validateUmlProjectDocument>): string[] {
  const warnings = validation.model.issues
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => formatValidationIssue(issue.path, issue.message))

  for (const diagram of validation.diagrams) {
    warnings.push(
      ...diagram.result.issues
        .filter((issue) => issue.severity === 'warning')
        .map((issue) => formatValidationIssue(`${diagram.diagramId}${issue.path ? `.${issue.path}` : ''}`, issue.message)),
    )
  }

  return warnings
}

function validationErrors(validation: ReturnType<typeof validateUmlProjectDocument>): string[] {
  const errors = validation.model.issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => formatValidationIssue(issue.path, issue.message))

  for (const diagram of validation.diagrams) {
    errors.push(
      ...diagram.result.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => formatValidationIssue(`${diagram.diagramId}${issue.path ? `.${issue.path}` : ''}`, issue.message)),
    )
  }

  return errors
}

function formatValidationIssue(path: string | undefined, message: string): string {
  return path ? `${path}: ${message}` : message
}
