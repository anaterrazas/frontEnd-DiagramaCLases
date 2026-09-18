// src/modules/editor/adapters/tests/adapter.test.ts
// Tests unitarios para la capa de adaptación Canvas ↔ UMLModel (Fase 2).
//
// Ejecutar con: npx vitest run src/modules/editor/adapters/tests/adapter.test.ts
// (si vitest está disponible) o importar manualmente en devtools.
// Aquí uso solo funciones puras + asserts, sin framework de testing externo.

import { canvasToUml } from '../canvasToUml'
import { umlToCanvas } from '../umlToCanvas'
import {
  parseCanvasAttribute,
  parseCanvasMethod,
  parseMultiplicityText,
  formatUmlProperty,
  formatUmlOperation,
  formatMultiplicity,
} from '../index'

import type { DiagramModel } from '@/modules/editor/services/canvas.engine'
import {
  case1_simpleClass,
  case2_attrMultiplicity,
  case3_methodParams,
  case4_generalization,
  case5_association,
  case6_aggregation,
  case7_composition,
  case8_dependency,
  case9_assocClass,
  case10_roundTripBase,
} from './fixtures'

/** Helper simple de aserción. */
function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  }
  console.log(`  ✓ ${msg}`)
}

let pass = 0
let fail = 0

function runTest(name: string, fn: () => void): void {
  try {
    console.log(`\n▶ ${name}`)
    fn()
    pass++
  } catch (e) {
    fail++
    console.error(`  ✗ ${name}: ${e}`)
  }
}

/* =========================================================================
 * PARSERS
 * ========================================================================= */

runTest('parseMultiplicityText — presets', () => {
  assertEqual(parseMultiplicityText('*').multiplicity, { lower: 0, upper: '*' }, '*')
  assertEqual(parseMultiplicityText('1').multiplicity, { lower: 1, upper: 1 }, '1')
  assertEqual(parseMultiplicityText('0..1').multiplicity, { lower: 0, upper: 1 }, '0..1')
  assertEqual(parseMultiplicityText('0..*').multiplicity, { lower: 0, upper: '*' }, '0..*')
  assertEqual(parseMultiplicityText('1..*').multiplicity, { lower: 1, upper: '*' }, '1..*')
  assertEqual(parseMultiplicityText('2..5').multiplicity, { lower: 2, upper: 5 }, '2..5')
})

runTest('parseCanvasAttribute — casos básicos', () => {
  const nameToId = new Map<string, string>()
  const { property: p1 } = parseCanvasAttribute('+ id: bigint', nameToId)
  assertEqual(p1.name, 'id')
  assertEqual(p1.type.kind, 'primitive')
  assertEqual(p1.type.name, 'bigint')
  assertEqual(p1.visibility, 'public')

  const { property: p2 } = parseCanvasAttribute('- nombre: string', nameToId)
  assertEqual(p2.visibility, 'private')

  const { property: p3 } = parseCanvasAttribute('# edad: int', nameToId)
  assertEqual(p3.visibility, 'protected')

  const { property: p4 } = parseCanvasAttribute('~ interno: string', nameToId)
  assertEqual(p4.visibility, 'package')
})

runTest('parseCanvasAttribute — multiplicidad separada', () => {
  const nameToId = new Map<string, string>()
  const { property: p } = parseCanvasAttribute('+ items: string [0..*]', nameToId)
  assertEqual(p.type.name, 'string', 'tipo NO debe contener multiplicidad')
  assertEqual(p.multiplicity, { lower: 0, upper: '*' }, 'multiplicidad estructurada')
})

runTest('parseCanvasAttribute — default value', () => {
  const nameToId = new Map<string, string>()
  const { property: p } = parseCanvasAttribute('+ activo: boolean = true', nameToId)
  assertEqual(p.defaultValue, 'true')
  assertEqual(p.type.name, 'boolean')
})

runTest('parseCanvasAttribute — static / readonly', () => {
  const nameToId = new Map<string, string>()
  const { property: p1 } = parseCanvasAttribute('+ codigo: string {static}', nameToId)
  assertEqual(p1.isStatic, true)

  const { property: p2 } = parseCanvasAttribute('+ id: bigint {readOnly}', nameToId)
  assertEqual(p2.isReadOnly, true)
})

runTest('parseCanvasMethod — parámetros y retorno', () => {
  const { operation: op } = parseCanvasMethod('+ login(u: string, p: string): boolean')
  assertEqual(op.name, 'login')
  assertEqual(op.visibility, 'public')
  assertEqual(op.parameters.length, 2)
  assertEqual(op.parameters[0].name, 'u')
  assertEqual(op.parameters[0].type.name, 'string')
  assertEqual(op.parameters[1].name, 'p')
  assertEqual(op.returnType?.name, 'boolean')
})

runTest('parseCanvasMethod — static/abstract', () => {
  const { operation: op1 } = parseCanvasMethod('- calcular(): void {abstract}')
  assertEqual(op1.isAbstract, true)
  assertEqual(op1.name, 'calcular')

  const { operation: op2 } = parseCanvasMethod('+ helper(): int {static}')
  assertEqual(op2.isStatic, true)
})

/* =========================================================================
 * FORMATTERS
 * ========================================================================= */

runTest('formatMultiplicity — canonical', () => {
  assertEqual(formatMultiplicity({ lower: 0, upper: '*' }), '0..*')
  assertEqual(formatMultiplicity({ lower: 1, upper: 1 }), '1')
  assertEqual(formatMultiplicity({ lower: 0, upper: 1 }), '0..1')
  assertEqual(formatMultiplicity({ lower: 0, upper: 5 }), '0..5')
  assertEqual(formatMultiplicity({ lower: 2, upper: 5 }), '2..5')
})

runTest('formatUmlProperty — idéntico al motor', () => {
  assertEqual(formatUmlProperty({
    id: 'x', name: 'id', type: { kind: 'primitive', name: 'bigint' }, visibility: 'public',
    multiplicity: { lower: 1, upper: 1 }, isOrdered: false, isUnique: true,
    isReadOnly: false, isStatic: false, isDerived: false,
    aggregation: 'none',
  }), '+ id: bigint')
})

runTest('formatUmlProperty — multiplicidad/default/static', () => {
  assertEqual(formatUmlProperty({
    id: 'x', name: 'items', type: { kind: 'primitive', name: 'string' }, visibility: 'public',
    multiplicity: { lower: 0, upper: '*' }, isOrdered: false, isUnique: true,
    isReadOnly: false, isStatic: false, isDerived: false,
    defaultValue: '[]', aggregation: 'none',
  }), '+ items: string [0..*] = []')

  assertEqual(formatUmlProperty({
    id: 'x', name: 'codigo', type: { kind: 'primitive', name: 'string' }, visibility: 'public',
    multiplicity: { lower: 1, upper: 1 }, isOrdered: false, isUnique: true,
    isReadOnly: false, isStatic: true, isDerived: false,
    aggregation: 'none',
  }), '+ codigo: string {static}')
})

runTest('formatUmlOperation — parámetros y retorno', () => {
  assertEqual(formatUmlOperation({
    id: 'x', name: 'login', visibility: 'public',
    parameters: [
      { id: '1', name: 'u', type: { kind: 'primitive', name: 'string' }, direction: 'in', multiplicity: { lower: 1, upper: 1 } },
      { id: '2', name: 'p', type: { kind: 'primitive', name: 'string' }, direction: 'in', multiplicity: { lower: 1, upper: 1 } },
    ],
    returnType: { kind: 'primitive', name: 'boolean' },
    isAbstract: false, isStatic: false,
  }), '+ login(u: string, p: string): boolean')
})

/* =========================================================================
 * CANVAS → UML
 * ========================================================================= */

runTest('CASE 1 — Clase simple → UMLClass', () => {
  const { model } = canvasToUml(case1_simpleClass as DiagramModel)
  assert(model.classifiers.length === 1)
  const c = model.classifiers[0]
  assertEqual(c.kind, 'class')
  assertEqual(c.name, 'Persona')
  assertEqual(c.attributes.length, 2)
  assertEqual(c.attributes[0].name, 'id')
  assertEqual(c.attributes[0].type.name, 'bigint')
  assertEqual(c.attributes[1].name, 'nombre')
})

runTest('CASE 2 — Atributo con multiplicidad → type limpio', () => {
  const { model } = canvasToUml(case2_attrMultiplicity as DiagramModel)
  const attr = model.classifiers[0].attributes[0]
  assertEqual(attr.name, 'items')
  assertEqual(attr.type.name, 'string', 'tipo NO contiene multiplicidad')
  assertEqual(attr.multiplicity, { lower: 0, upper: '*' }, 'multiplicidad estructurada')
})

runTest('CASE 3 — Método con parámetros → UMLOperation estructurada', () => {
  const { model } = canvasToUml(case3_methodParams as DiagramModel)
  const op = model.classifiers[0].operations[0]
  assertEqual(op.name, 'login')
  assertEqual(op.parameters.length, 2)
  assertEqual(op.parameters[0].name, 'u')
  assertEqual(op.parameters[0].type.name, 'string')
  assertEqual(op.parameters[1].name, 'p')
  assertEqual(op.returnType?.name, 'boolean')
})

runTest('CASE 4 — Herencia (Empleado → Persona) → UMLGeneralization', () => {
  const { model } = canvasToUml(case4_generalization as DiagramModel)
  assert(model.generalizations.length === 1)
  const g = model.generalizations[0]
  assertEqual(g.specificId, 'cls-empleado', 'specific = subclase')
  assertEqual(g.generalId, 'cls-persona', 'general = superclase')
})

runTest('CASE 5 — Asociación binaria → UMLAssociation con extremos', () => {
  const { model } = canvasToUml(case5_association as DiagramModel)
  assert(model.associations.length === 1)
  const a = model.associations[0]
  assertEqual(a.ends.length, 2)
  assertEqual(a.ends[0].multiplicity, { lower: 1, upper: 1 })
  assertEqual(a.ends[1].multiplicity, { lower: 0, upper: '*' })
  assertEqual(a.ends[0].type.classifierId, 'cls-persona')
  assertEqual(a.ends[1].type.classifierId, 'cls-mascota')
})

runTest('CASE 6 — Agregación → UMLAssociation shared', () => {
  const { model } = canvasToUml(case6_aggregation as DiagramModel)
  const a = model.associations[0]
  assertEqual(a.ends[0].aggregation, 'shared')
  assertEqual(a.ends[1].aggregation, 'none')
})

runTest('CASE 7 — Composición → UMLAssociation composite', () => {
  const { model } = canvasToUml(case7_composition as DiagramModel)
  const a = model.associations[0]
  assertEqual(a.ends[0].aggregation, 'composite')
  assertEqual(a.ends[1].aggregation, 'none')
})

runTest('CASE 8 — Dependencia → UMLDependency', () => {
  const { model } = canvasToUml(case8_dependency as DiagramModel)
  assert(model.dependencies.length === 1)
  const d = model.dependencies[0]
  assertEqual(d.clientId, 'cls-cliente')
  assertEqual(d.supplierId, 'cls-servicio')
})

runTest('CASE 9 — Association Class → UMLAssociationClass', () => {
  const { model } = canvasToUml(case9_assocClass as DiagramModel)
  assert(model.associationClasses.length === 1)
  const ac = model.associationClasses[0]
  assertEqual(ac.classId, 'cls-adopcion')
  assertEqual(ac.associationId, 'link-assoc-ac')
  // La asociación debe tener associationClassId
  assertEqual(model.associations[0].associationClassId, 'acl-link-assoc-ac')
})

runTest('CASE 10 — Round-trip Canvas→UML→Canvas sin pérdida en representables', () => {
  const { model, view } = canvasToUml(case10_roundTripBase as DiagramModel)
  const { model: canvasBack } = umlToCanvas(model, view)

  // Clases
  assert(canvasBack.classes['cls-A'] !== undefined)
  assert(canvasBack.classes['cls-B'] !== undefined)

  // Atributos
  const attrsA = canvasBack.classes['cls-A'].attributes
  const itemsAttr = attrsA.find((a: string) => a.includes('items'))
  assert(itemsAttr !== undefined && itemsAttr.includes('[0..*]'), 'multiplicidad conservada')

  const staticAttr = attrsA.find((a: string) => a.includes('{static}'))
  assert(staticAttr !== undefined, 'static conservado')

  const defaultAttr = attrsA.find((a: string) => a.includes('='))
  assert(defaultAttr !== undefined, 'default conservado')

  // Métodos
  const methodsA = canvasBack.classes['cls-B'].methods
  // abstract no se redibuja (warning)

  // Asociación
  const linkAB = canvasBack.links['link-AB']
  assert(linkAB !== undefined)
  assertEqual(linkAB.kind, 'Associate')
  assertEqual(linkAB.labels.src, '1')
  assertEqual(linkAB.labels.tgt, '0..*')
  assertEqual(linkAB.anchorSrc?.side, 'R')
  assertEqual(linkAB.anchorTgt?.side, 'L')
})

/* =========================================================================
 * RESUMEN
 * ========================================================================= */

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1