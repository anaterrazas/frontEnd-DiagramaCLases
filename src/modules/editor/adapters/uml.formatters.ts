// src/modules/editor/adapters/uml.formatters.ts
//
// FORMATTERS de conversión pura: estructuras del modelo semántico UML →
// sintaxis textual del Canvas `ClassNode.attributes'/`methods` (string[]).
//
// Reutiliza la convención de texto que el motor ya usa hoy
// (ver formatAttrLine/formatMethodLine en canvas.engine.ts).

import type {
  UMLMultiplicity,
  UMLOperation,
  UMLProperty,
  UMLTypeReference,
  UMLVisibility,
} from '@/core/uml'

/** Convierte la multiplicidad estructurada en su texto canónico. */
export function formatMultiplicity(m: UMLMultiplicity): string {
  if (m.upper === '*') return m.lower === 0 ? '0..*' : `${m.lower}..*`
  if (m.lower === m.upper) return `${m.lower}`
  return `${m.lower}..${m.upper}`
}

/** `{ lower: 1, upper: 1 }` es la multiplicidad por defecto UML de una Property. */
export function isDefaultMultiplicity(m: UMLMultiplicity): boolean {
  return m.lower === 1 && m.upper === 1
}

/** Símbolo de visibilidad para el texto del Canvas. */
export function visibilityToSymbol(v: UMLVisibility): string {
  switch (v) {
    case 'private': return '-'
    case 'protected': return '#'
    case 'package': return '~'
    case 'public':
    default:
      return '+'
  }
}

/** Solo el nombre del tipo (el Canvas no tiene discriminador de tipo). */
export function typeReferenceToName(t: UMLTypeReference | undefined): string {
  return t?.name ?? ''
}

/**
 * Formatea una propiedad UML a la línea de atributo del Canvas.
 *
 * Orden idéntico al que el motor genera hoy:
 * `[vis] nombre : tipo [mult] = default {readOnly} {static}`
 */
export function formatUmlProperty(p: UMLProperty): string {
  const vis = visibilityToSymbol(p.visibility)
  const name = p.name.trim()
  const type = typeReferenceToName(p.type)
  const pieces: string[] = []

  pieces.push(`${vis} ${name}`)
  if (type) pieces.push(`: ${type}`)
  if (!isDefaultMultiplicity(p.multiplicity)) {
    pieces.push(` [${formatMultiplicity(p.multiplicity)}]`)
  }
  if (p.defaultValue !== undefined && p.defaultValue !== null) {
    pieces.push(` = ${p.defaultValue}`)
  }
  if (p.isReadOnly) pieces.push(' {readOnly}')
  if (p.isStatic) pieces.push(' {static}')

  return pieces.join('').trim()
}

function formatParameter(p: { name: string; type: UMLTypeReference; defaultValue?: string }): string {
  const type = typeReferenceToName(p.type)
  const base = type ? `${p.name}: ${type}` : p.name
  return p.defaultValue !== undefined && p.defaultValue !== null ? `${base} = ${p.defaultValue}` : base
}

/**
 * Formatea una operación UML a la línea de método del Canvas.
 *
 * Solo las direcciones `in` tienen representación textual; `out/inout/return`
 * se omiten (pérdida controlada, reportada por el caller vía warnings).
 */
export function formatUmlOperation(op: UMLOperation): string {
  const vis = visibilityToSymbol(op.visibility)
  const params = op.parameters.map(formatParameter).join(', ')
  const ret = op.returnType ? `: ${typeReferenceToName(op.returnType)}` : ''

  let line = `${vis} ${op.name}(${params})${ret}`
  if (op.isStatic) line += ' {static}'
  if (op.isAbstract) line += ' {abstract}'

  return line.trim()
}