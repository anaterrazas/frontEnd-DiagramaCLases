// src/core/uml/xmi/diagram/exportUmlDiagramViewToXmi.ts
// Exportacion visual experimental con extension Enterprise Architect.

import type { UMLDiagramElement, UMLDiagramLink, UMLDiagramView } from '../../uml.visual'
import { xmlAttribute } from '../xmi.escape'
import type {
  XmiDiagramExportOptions,
  XmiDiagramExportResult,
} from './xmi.diagram.types'

const EA_EXTENDER = 'Enterprise Architect'

export function exportUmlDiagramViewToXmi(
  view: UMLDiagramView,
  options: XmiDiagramExportOptions = {},
): XmiDiagramExportResult {
  const warnings: string[] = []
  const errors: string[] = []
  const writer = new XmlWriter(options.pretty !== false)

  validateView(view, warnings, errors)
  const diagramGuid = makeDiagramGuid(view.id)

  writer.open(`xmi:Extension${xmlAttribute('extender', EA_EXTENDER)}`)
  writer.open('diagrams')
  writer.open(`diagram${xmlAttribute('xmi:id', diagramGuid)}${xmlAttribute('name', view.name)}${xmlAttribute('diagram_guid', diagramGuid)}`)
  writer.open('elements')
  view.elements.forEach((element, index) => {
    writeElement(writer, element, index + 1, diagramGuid)
  })
  writer.close('elements')

  if ((view.links ?? []).length > 0) {
    warnings.push('Los conectores visuales fueron exportados en formato EA experimental; el dialecto completo todavía no está implementado.')
  }

  writer.open('connectors')
  for (const link of view.links ?? []) {
    writeConnector(writer, link, diagramGuid)
  }
  writer.close('connectors')
  writer.close('diagram')
  writer.close('diagrams')
  writer.close('xmi:Extension')

  warnings.push('Los elementos visuales fueron exportados usando la extension Enterprise Architect.')
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
): XmiDiagramExportResult {
  const warnings: string[] = []
  const errors: string[] = []
  const fragments: string[] = []

  for (const view of views) {
    const result = exportUmlDiagramViewToXmi(view, options)
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
  diagramGuid: string,
): void {
  writer.selfClosing(
    `element${xmlAttribute('xmi:id', element.id)}${xmlAttribute('xmi:idref', nonEmpty(element.semanticElementId))}${xmlAttribute('subject', nonEmpty(element.semanticElementId))}${xmlAttribute('diagram_guid', diagramGuid)}${xmlAttribute('geometry', formatGeometry(element))}${xmlAttribute('seqno', sequence)}${xmlAttribute('style', formatStyle(element))}`,
  )
}

function writeConnector(writer: XmlWriter, link: UMLDiagramLink, diagramGuid: string): void {
  const relationType = typeof link.style?.type === 'string' && link.style.type.trim() !== ''
    ? link.style.type
    : undefined

  writer.selfClosing(
    `connector${xmlAttribute('xmi:id', link.id)}${xmlAttribute('xmi:idref', nonEmpty(link.semanticElementId))}${xmlAttribute('subject', nonEmpty(link.semanticElementId))}${xmlAttribute('diagram_guid', diagramGuid)}${xmlAttribute('source', nonEmpty(link.sourceElementId))}${xmlAttribute('target', nonEmpty(link.targetElementId))}${xmlAttribute('sourceElement', nonEmpty(link.sourceElementId))}${xmlAttribute('targetElement', nonEmpty(link.targetElementId))}${xmlAttribute('type', relationType)}${xmlAttribute('sourceSide', link.anchorSrc?.side)}${xmlAttribute('sourceT', link.anchorSrc?.t)}${xmlAttribute('targetSide', link.anchorTgt?.side)}${xmlAttribute('targetT', link.anchorTgt?.t)}`,
  )
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
