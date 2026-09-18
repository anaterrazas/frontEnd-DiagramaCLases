// src/modules/editor/adapters/uml.parsers.ts
//
// PARSERS de conversión pura: texto plano del Canvas (atributos/métodos/
// multiplicidades) → estructuras del modelo semántico UML (src/core/uml).
//
// Garantías:
//  - la multiplicidad NUNCA se incrusta en el tipo (evita `type: "string [0..*]"`)
//  - los parámetros de operaciones se separan del nombre (`name: "login"`)
//  - no se inventa información: solo se extrae lo que el texto contiene

import type {
  UMLMultiplicity,
  UMLOperation,
  UMLParameter,
  UMLProperty,
  UMLTypeReference,
  UMLVisibility,
} from '@/core/uml'
import type { UMLAggregation, UMLParameterDirection } from '@/core/uml'

/* =========================================================================
 * MULTIPLICIDAD
 * ========================================================================= */

/** Convierte el texto de multiplicidad del Canvas en la estructura UML. */
export function parseMultiplicityText(text: string | undefined | null): {
  multiplicity: UMLMultiplicity | undefined
  error?: string
} {
  const t = (text ?? '').trim()
  if (!t) return { multiplicity: undefined }

  if (t === '*') return { multiplicity: { lower: 0, upper: '*' } }
  if (/^\d+$/.test(t)) {
    return { multiplicity: { lower: Number(t), upper: Number(t) } }
  }
  const m = /^(\d+)\s*\.\.\s*(\d+|\*)$/.exec(t)
  if (m) {
    return { multiplicity: { lower: Number(m[1]), upper: m[2] === '*' ? '*' : Number(m[2]) } }
  }
  return { multiplicity: undefined, error: `Multiplicidad no reconocida: "${t}"` }
}

/* =========================================================================
 * VISIBILIDAD
 * ========================================================================= */

const VIS_SYMBOL_TO_UML: Record<string, UMLVisibility> = {
  '+': 'public',
  '-': 'private',
  '#': 'protected',
  '~': 'package',
}

/** Lee el símbolo de visibilidad inicial (`+ nombre` o `+nombre`). */
function stripVisibility(raw: string): { visibility: UMLVisibility; rest: string } {
  const s = (raw ?? '').trim()
  const ch = s.charAt(0)
  if (ch && '+-#~'.includes(ch)) {
    return { visibility: VIS_SYMBOL_TO_UML[ch], rest: s.slice(1).trim() }
  }
  return { visibility: 'public', rest: s }
}

/* =========================================================================
 * TIPOS
 * ========================================================================= */

/** Tipos que el proyecto reconoce como primitivos (whitelist del editor + afines). */
export const CANVAS_PRIMITIVE_TYPES = new Set([
  'int', 'integer', 'bigint', 'long', 'short', 'byte', 'char',
  'float', 'double', 'decimal', 'number',
  'string', 'text', 'bool', 'boolean',
  'date', 'time', 'datetime', 'uuid', 'json', 'void',
])

/**
 * Construye una UMLTypeReference a partir del texto del tipo.
 *
 * - si el texto está en la whitelist primitiva → `kind: 'primitive'`
 * - si coincide con un classifier del diagrama → `kind: 'classifier'` (con classifierId)
 * - si no → `kind: 'external'` (tipo fuera del modelo)
 *
 * NULL si no hay tipo (lo deciden los callers según el contexto).
 */
export function makeTypeReference(
  raw: string | undefined,
  classifierNameToId?: Map<string, string>,
): UMLTypeReference | undefined {
  const name = (raw ?? '').trim()
  if (!name) return undefined

  if (CANVAS_PRIMITIVE_TYPES.has(name.toLowerCase()) || CANVAS_PRIMITIVE_TYPES.has(name)) {
    return { kind: 'primitive', name }
  }
  const classifierId = classifierNameToId?.get(name)
  if (classifierId) {
    return { kind: 'classifier', name, classifierId }
  }
  return { kind: 'external', name }
}

/** Busca el `=` del valor por defecto que esté FUERA de comillas. */
function splitDefault(raw: string): { body: string; defaultValue?: string } {
  const s = raw.trim()
  let inQuote: string | null = null
  let eq = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuote) {
      if (c === inQuote) inQuote = null
      continue
    }
    if (c === '"' || c === "'") inQuote = c
    else if (c === '=') eq = i
  }
  if (eq === -1) return { body: s }
  return { body: s.slice(0, eq).trimEnd(), defaultValue: s.slice(eq + 1).trim() }
}

/* =========================================================================
 * ATRIBUTOS (Property)
 * ========================================================================= */

/** Parseo de una propiedad que no produce id (el mapper lo asigna). */
export interface ParsedUmlProperty {
  property: Omit<UMLProperty, 'id'>
  warnings: string[]
}

/**
 * Parsea una línea de atributo del Canvas.
 *
 * Soporta (con espacios o pegados):
 *   + id: bigint
 *   - nombre: string
 *   + items: string [0..*]
 *   + nombre: string = "Ana"
 *   + codigo: string {static}
 *   + id: bigint {readOnly}
 **/
export function parseCanvasAttribute(raw: string, classifierNameToId?: Map<string, string>): ParsedUmlProperty {
  const warnings: string[] = []
  const { visibility, rest: s0 } = stripVisibility(raw)

  // 1) modificadores {…} al final (convención del motor: {static}, {readOnly})
  let rest = s0
  let isStatic = false
  let isReadOnly = false
  for (;;) {
    const m = /^(.+?)\s*\{([^}]+)\}\s*$/.exec(rest)
    if (!m) break
    const kw = m[2].trim().toLowerCase()
    if (kw === 'static') isStatic = true
    else if (kw === 'readonly') isReadOnly = true
    else warnings.push(`Modificador de atributo no representado: "{${m[2].trim()}"`)
    rest = m[1].trim()
  }

  // 2) default `= …` fuera de comillas
  const { body, defaultValue } = splitDefault(rest)

  // 3) nombre : tipo [multiplicidad]
  const colon = body.indexOf(':')
  let name = ''
  let typeText = ''
  let multiplicity: UMLMultiplicity | undefined
  if (colon === -1) {
    name = body.trim()
    typeText = ''
  } else {
    name = body.slice(0, colon).trim()
    typeText = body.slice(colon + 1).trim()
  }

  // 3b) multiplicidad [..] al final del tipo
  const multMatch = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(typeText)
  if (multMatch) {
    typeText = multMatch[1].trim()
    const parsed = parseMultiplicityText(multMatch[2])
    if (parsed.error) warnings.push(parsed.error)
    else multiplicity = parsed.multiplicity ?? { lower: 0, upper: '*' }
  }

  const typeName = typeText || 'string' // paridad con el parser legado del editor
  const type = makeTypeReference(typeName, classifierNameToId) ?? { kind: 'primitive' as const, name: typeName }

  const property: Omit<UMLProperty, 'id'> = {
    name,
    type,
    visibility,
    multiplicity: multiplicity ?? { lower: 1, upper: 1 },
    isOrdered: false,
    isUnique: true,
    isReadOnly,
    isStatic,
    isDerived: false,
    defaultValue,
    aggregation: 'none',
  }

  return { property, warnings }
}

/* =========================================================================
 * MÉTODOS (Operation)
 * ========================================================================= */

/** Parsea el bloque de parámetros `a: int, b: string [0..*], c = 3`. */
function parseParameters(raw: string, warnings: string[]): Omit<UMLParameter, 'id'>[] {
  const s = (raw ?? '').trim()
  if (!s) return []

  // split por comas a profundidad de paréntesis 0
  const parts: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) parts.push(buf)

  return parts.map((partRaw) => parseParameter(partRaw, warnings))
}

function parseParameter(raw: string, warnings: string[]): Omit<UMLParameter, 'id'> {
  const { body, defaultValue } = splitDefault(raw)

  // multiplicidad [..] en el tipo
  let typeText = body
  let multiplicity: UMLMultiplicity | undefined
  const multMatch = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(typeText)
  if (multMatch) {
    typeText = multMatch[1].trim()
    const parsed = parseMultiplicityText(multMatch[2])
    if (parsed.error) warnings.push(parsed.error)
    else multiplicity = parsed.multiplicity ?? undefined
  }

  const colon = typeText.indexOf(':')
  let name: string
  let typeName: string
  if (colon === -1) {
    name = typeText.trim()
    typeName = 'string'
  } else {
    name = typeText.slice(0, colon).trim()
    typeName = typeText.slice(colon + 1).trim() || 'string'
  }

  const type = makeTypeReference(typeName) ?? { kind: 'primitive' as const, name: typeName }

  return {
    name,
    type,
    direction: 'in' as UMLParameterDirection,
    multiplicity: multiplicity ?? { lower: 1, upper: 1 },
    defaultValue,
  }
}

/** Parsea una línea de método del Canvas en una operación UML (sin id). */
export function parseCanvasMethod(raw: string): {
  operation: Omit<UMLOperation, 'id'>
  warnings: string[]
} {
  const warnings: string[] = []
  const { visibility, rest: s0 } = stripVisibility(raw)

  // 1) modificadores {static}/{abstract} al final
  let rest = s0
  let isStatic = false
  let isAbstract = false
  for (;;) {
    const m = /^(.+?)\s*\{([^}]+)\}\s*$/.exec(rest)
    if (!m) break
    const kw = m[2].trim().toLowerCase()
    if (kw === 'static') isStatic = true
    else if (kw === 'abstract') isAbstract = true
    else warnings.push(`Modificador de método no representado: "{${m[2].trim()}"`)
    rest = m[1].trim()
  }

  // 2) separar el retorno: el último `:` a profundidad de paréntesis 0
  let depth = 0
  let retColon = -1
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ':' && depth === 0) retColon = i
  }

  const head = retColon === -1 ? rest.trim() : rest.slice(0, retColon).trim()
  const retText = retColon === -1 ? '' : rest.slice(retColon + 1).trim()

  // 3) nombre + parámetros
  const paren = /^(.+?)\s*\(([^)]*)\)\s*$/.exec(head)
  const name = paren ? paren[1].trim() : head
  const paramsRaw = paren ? paren[2] : ''

  const parameters = parseParameters(paramsRaw, warnings)

  const returnType = makeTypeReference(retText)

  const operation: Omit<UMLOperation, 'id'> = {
    name,
    visibility,
    parameters,
    returnType,
    isAbstract,
    isStatic,
  }

  return { operation, warnings }
}