// src/core/uml/xmi/bridge/exportDrawSchemaToXmi.ts

import type { UMLProjectDocument } from '../../uml.project'
import { validateUmlProjectDocument } from '../../uml.project.serialization'
import { exportUmlDiagramViewsToXmi } from '../diagram'
import { exportUmlModelToXmi } from '../exportUmlToXmi'
import type { XmiBridgeExportOptions, XmiBridgeExportResult } from './bridge.types'

export function exportDrawSchemaToXmi(
  document: UMLProjectDocument,
  options: XmiBridgeExportOptions = {},
): XmiBridgeExportResult {
  const validation = validateUmlProjectDocument(document)
  const exportResult = exportUmlModelToXmi(document.model, {
    pretty: options.pretty,
  })
  const diagramResult = exportUmlDiagramViewsToXmi(document.diagrams, {
    pretty: options.pretty,
  })
  const warnings = [
    ...validationWarnings(validation),
    ...exportResult.warnings,
    ...diagramResult.warnings,
    ...diagramWarnings(document),
  ]

  return {
    xmi: appendXmiExtension(exportResult.xmi, diagramResult.xmi),
    document,
    warnings,
    errors: [
      ...validationErrors(validation),
      ...diagramResult.errors,
    ],
    validation,
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

function diagramWarnings(document: UMLProjectDocument): string[] {
  const warnings: string[] = []

  if (document.diagrams.some((diagram) => diagram.elements.length > 0)) {
    warnings.push('Los elementos visuales fueron exportados usando formato UML:DiagramElement compatible con EA. Los conectores visuales todavía no están implementados.')
  }

  if (document.diagrams.some((diagram) => (diagram.links?.length ?? 0) > 0)) {
    warnings.push('Los enlaces visuales todavía no están implementados como conectores EA.')
  }

  if (document.diagrams.length > 0) {
    warnings.push('Las vistas de los diagramas se exportan como elementos UML:DiagramElement directos.')
  }

  return warnings
}

function formatValidationIssue(path: string | undefined, message: string): string {
  return path ? `${path}: ${message}` : message
}

function appendXmiExtension(xmi: string, extension: string): string {
  if (extension.trim() === '') {
    return xmi
  }

  const closingTag = '</xmi:XMI>'
  const closingIndex = xmi.lastIndexOf(closingTag)
  if (closingIndex < 0) {
    return xmi
  }

  const separator = xmi.endsWith('\n', closingIndex) ? '' : '\n'
  return `${xmi.slice(0, closingIndex)}${separator}${extension}${xmi.slice(closingIndex)}`
}
