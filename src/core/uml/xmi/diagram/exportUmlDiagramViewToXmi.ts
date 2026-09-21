// src/core/uml/xmi/diagram/exportUmlDiagramViewToXmi.ts
// Exportacion visual basica compatible con UML Diagram de Enterprise Architect.

import type { UMLDiagramElement, UMLDiagramLink, UMLDiagramView } from '../../uml.visual'
import { xmlAttribute } from '../xmi.escape'
import type {
  XmiDiagramExportOptions,
  XmiDiagramExportResult,
} from './xmi.diagram.types'

export function exportUmlDiagramViewToXmi(
  view: UMLDiagramView,
  options: XmiDiagramExportOptions = {},
  ownerId?: string,
): XmiDiagramExportResult {
  const warnings: string[] = []
  const errors: string[] = []
  const writer = new XmlWriter(options.pretty !== false)

  validateView(view, warnings, errors)
  const diagramGuid = makeDiagramGuid(view.id)

  writer.open(`UML:Diagram${xmlAttribute('xmlns:UML', 'omg.org/UML1.3')}${xmlAttribute('name', view.name)}${xmlAttribute('xmi.id', diagramGuid)}${xmlAttribute('diagramType', 'ClassDiagram')}${xmlAttribute('owner', ownerId)}${xmlAttribute('toolName', 'Enterprise Architect 2.5')}`)
  writer.open('UML:Diagram.element')
  view.elements.forEach((element, index) => {
    writeElement(writer, element, index + 1)
  })

  for (const link of view.links ?? []) {
    writeRelationElement(writer, link)
  }

  writer.close('UML:Diagram.element')
  writer.close('UML:Diagram')

  warnings.push(...styleWarnings(view))

  return {
    xmi: writer.toString(),
    warnings,
    errors,
  }
}

export function exportUmlDiagramViewsToXmi(
  views: UMLDiagramView[],
  options: XmiDiagramExportOptions = {},
  ownerId?: string,
): XmiDiagramExportResult {
  const warnings: string[] = []
  const errors: string[] = []
  const fragments: string[] = []

  for (const view of views) {
    const result = exportUmlDiagramViewToXmi(view, options, ownerId)
    fragments.push(result.xmi)
    warnings.push(...result.warnings)
    errors.push(...result.errors)
  }

  return {
    xmi: fragments.join(options.pretty === false ? '' : '\n'),
    warnings,
    errors,
  }
}

function validateView(view: UMLDiagramView, warnings: string[], errors: string[]): void {
  if (view.id.trim() === '') {
    errors.push('La vista UML no tiene un id valido.')
  }

  const elementIds = new Set(view.elements.map((element) => element.id))

  for (const element of view.elements) {
    if (element.semanticElementId.trim() === '') {
      warnings.push(`El elemento visual "${element.id}" no tiene semanticElementId.`)
    }
  }

  for (const link of view.links ?? []) {
    validateLink(link, elementIds, warnings)
  }
}

function validateLink(link: UMLDiagramLink, elementIds: Set<string>, warnings: string[]): void {
  if (link.semanticElementId.trim() === '') {
    warnings.push(`El link visual "${link.id}" no tiene semanticElementId.`)
  }
  if (!elementIds.has(link.sourceElementId)) {
    warnings.push(`El link visual "${link.id}" no encuentra sourceElementId "${link.sourceElementId}".`)
  }
  if (!elementIds.has(link.targetElementId)) {
    warnings.push(`El link visual "${link.id}" no encuentra targetElementId "${link.targetElementId}".`)
  }
}

function writeElement(
  writer: XmlWriter,
  element: UMLDiagramElement,
  sequence: number,
): void {
  writer.selfClosing(
    `UML:DiagramElement${xmlAttribute('geometry', formatGeometry(element))}${xmlAttribute('subject', nonEmpty(element.semanticElementId))}${xmlAttribute('seqno', sequence)}${xmlAttribute('style', formatStyle(element))}`,
  )
}

function writeRelationElement(writer: XmlWriter, link: UMLDiagramLink): void {
  writer.selfClosing(
    `UML:DiagramElement${xmlAttribute('geometry', 'SX=0;SY=0;EX=0;EY=0;Path=;')}${xmlAttribute('subject', nonEmpty(link.semanticElementId))}${xmlAttribute('style', formatRelationStyle(link))}`,
  )
}

function formatRelationStyle(link: UMLDiagramLink): string {
  return `DUID=${link.id};Hidden=0;`
}

function formatGeometry(element: UMLDiagramElement): string {
  return `Left=${element.x};Top=${element.y};Right=${element.x + element.width};Bottom=${element.y + element.height};`
}

function formatStyle(element: UMLDiagramElement): string {
  const values = [`DUID=${element.id};`]

  for (const [key, value] of Object.entries(element.style ?? {})) {
    if (key === 'DUID' || value === undefined || value === null) continue
    if (typeof value === 'object') continue
    values.push(`${key}=${String(value)};`)
  }

  if (element.hidden) values.push('Hidden=1;')
  if (element.collapsed) values.push('Collapsed=1;')

  return values.join('')
}

function styleWarnings(view: UMLDiagramView): string[] {
  if (!view.elements.some((element) => element.style !== undefined)) {
    return []
  }

  return ['Los estilos visuales complejos se redujeron a propiedades simples compatibles con EA.']
}

function nonEmpty(value: string): string | undefined {
  return value.trim() === '' ? undefined : value
}

function makeDiagramGuid(viewId: string): string {
  return viewId.startsWith('EAID_') ? viewId : `EAID_${viewId}`
}

class XmlWriter {
  private readonly lines: string[] = []
  private level = 0

  constructor(private readonly pretty: boolean) {}

  open(tag: string): void {
    this.lines.push(`${this.indent()}<${tag}>`)
    this.level++
  }

  close(tag: string): void {
    this.level--
    this.lines.push(`${this.indent()}</${tag}>`)
  }

  selfClosing(tag: string): void {
    this.lines.push(`${this.indent()}<${tag}/>`)
  }

  toString(): string {
    return this.pretty ? this.lines.join('\n') : this.lines.map((line) => line.trim()).join('')
  }

  private indent(): string {
    return this.pretty ? '  '.repeat(this.level) : ''
  }
}
