// src/core/uml/xmi/bridge/tests/xmiBridge.test.ts
// Pruebas de exportacion/importacion del XMI Bridge.
//
// Ejecutar con: npx tsx src/core/uml/xmi/bridge/tests/xmiBridge.test.ts

import { UML_APP_FORMAT_VERSION, UML_VERSION } from '../../../uml.model'
import type { UMLClass, UMLModel } from '../../../uml.model'
import type { UMLProjectDocument } from '../../../uml.project'
import { createUmlProjectDocument } from '../../../uml.project.serialization'
import type { UMLDiagramView } from '../../../uml.visual'
import { validateUmlProjectDocument } from '../../../uml.project.serialization'
import {
  exportDrawSchemaToXmi,
  importXmiToDrawSchema,
} from '../index'

let pass = 0
let fail = 0

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

function makeDocument(): UMLProjectDocument {
  const model: UMLModel = {
    id: 'model-bridge',
    name: 'Modelo XMI Bridge',
    umlVersion: UML_VERSION,
    formatVersion: UML_APP_FORMAT_VERSION,
    packages: [],
    classifiers: [makePersona(), makeEmpleado(), makeMascota()],
    associations: [
      {
        id: 'assoc-persona-mascota',
        name: 'adopta',
        ends: [
          {
            id: 'end-persona',
            type: { kind: 'classifier', name: 'Persona', classifierId: 'class-persona' },
            role: 'duenio',
            multiplicity: { lower: 1, upper: 1 },
            isNavigable: true,
            isOrdered: false,
            isUnique: true,
            aggregation: 'none',
          },
          {
            id: 'end-mascota',
            type: { kind: 'classifier', name: 'Mascota', classifierId: 'class-mascota' },
            role: 'mascotas',
            multiplicity: { lower: 0, upper: '*' },
            isNavigable: false,
            isOrdered: false,
            isUnique: true,
            aggregation: 'none',
          },
        ],
      },
    ],
    generalizations: [
      {
        id: 'gen-empleado-persona',
        specificId: 'class-empleado',
        generalId: 'class-persona',
      },
    ],
    dependencies: [],
    realizations: [],
    associationClasses: [],
    stereotypes: [],
  }

  const view: UMLDiagramView = {
    id: 'view-bridge',
    name: 'Vista Bridge',
    elements: [
      viewElement('class-persona', 40, 40),
      viewElement('class-empleado', 280, 40),
      viewElement('class-mascota', 520, 40),
    ],
    links: [
      {
        id: 'view-assoc-persona-mascota',
        semanticElementId: 'assoc-persona-mascota',
        sourceElementId: 'view-class-persona',
        targetElementId: 'view-class-mascota',
      },
      {
        id: 'view-gen-empleado-persona',
        semanticElementId: 'gen-empleado-persona',
        sourceElementId: 'view-class-empleado',
        targetElementId: 'view-class-persona',
      },
    ],
  }

  return createUmlProjectDocument({
    id: 'project-bridge',
    name: 'Proyecto XMI Bridge',
    model,
    diagrams: [view],
    activeDiagramId: view.id,
  })
}

function makePersona(): UMLClass {
  return {
    kind: 'class',
    id: 'class-persona',
    name: 'Persona',
    visibility: 'public',
    isAbstract: false,
    attributes: [
      makeAttribute('attr-id', 'id'),
      makeAttribute('attr-nombre', 'nombre'),
    ],
    operations: [
      {
        id: 'op-saludar',
        name: 'saludar',
        visibility: 'public',
        parameters: [
          {
            id: 'param-mensaje',
            name: 'mensaje',
            type: { kind: 'primitive', name: 'String' },
            direction: 'in',
            multiplicity: { lower: 1, upper: 1 },
          },
        ],
        returnType: { kind: 'primitive', name: 'String' },
        isAbstract: false,
        isStatic: false,
      },
    ],
  }
}

function makeEmpleado(): UMLClass {
  return {
    kind: 'class',
    id: 'class-empleado',
    name: 'Empleado',
    visibility: 'public',
    isAbstract: false,
    attributes: [],
    operations: [],
  }
}

function makeMascota(): UMLClass {
  return {
    kind: 'class',
    id: 'class-mascota',
    name: 'Mascota',
    visibility: 'public',
    isAbstract: false,
    attributes: [],
    operations: [],
  }
}

function makeAttribute(id: string, name: string) {
  return {
    id,
    name,
    type: { kind: 'primitive' as const, name: 'String' },
    visibility: 'private' as const,
    multiplicity: { lower: 1, upper: 1 },
    isOrdered: false,
    isUnique: true,
    isReadOnly: false,
    isStatic: false,
    isDerived: false,
    aggregation: 'none' as const,
  }
}

function viewElement(semanticElementId: string, x: number, y: number) {
  return {
    id: `view-${semanticElementId}`,
    semanticElementId,
    x,
    y,
    width: 180,
    height: 100,
  }
}

const sourceDocument = makeDocument()
const sourceValidation = validateUmlProjectDocument(sourceDocument)
const exported = exportDrawSchemaToXmi(sourceDocument)

runTest('Exporta UMLProjectDocument a XMI', () => {
  assertEqual(sourceValidation.valid, true, 'fixture UMLProjectDocument valido')
  assert(exported.xmi.length > 0, 'genera XMI no vacio')
  assert(exported.xmi.includes('name="Persona"'), 'incluye Persona')
  assert(exported.xmi.includes('name="Empleado"'), 'incluye Empleado')
  assert(exported.xmi.includes('name="Mascota"'), 'incluye Mascota')
  assert(exported.xmi.includes('name="saludar"'), 'incluye operacion saludar')
  assert(exported.xmi.includes('xmi:type="uml:Association"'), 'incluye asociacion')
  assert(exported.xmi.includes('<generalization'), 'incluye generalizacion')
  assertEqual(exported.validation.valid, true, 'exportacion con validacion valida')
})

runTest('Advierte que las vistas no se exportan a XMI', () => {
  assert(exported.warnings.some((warning) => warning.includes('elementos visuales')), 'advierte elementos visuales')
  assert(exported.warnings.some((warning) => warning.includes('enlaces visuales')), 'advierte enlaces visuales')
  assert(exported.warnings.some((warning) => warning.includes('vistas de los diagramas')), 'advierte vistas no exportadas')
})

const imported = importXmiToDrawSchema(exported.xmi)

runTest('Importa XMI a UMLProjectDocument', () => {
  assertEqual(imported.errors.length, 0, 'importacion sin errores')
  assert(imported.document !== undefined, 'recupera UMLProjectDocument')
  assert(imported.model !== undefined, 'recupera UMLModel')
  assertEqual(imported.validation?.valid, true, 'documento importado valido')
  assertEqual(imported.model?.classifiers.length, 3, 'recupera tres classifiers')
  assertEqual(imported.model?.associations.length, 1, 'recupera asociacion')
  assertEqual(imported.model?.generalizations.length, 1, 'recupera generalizacion')
})

runTest('Genera UMLDiagramView sintetica', () => {
  assertEqual(imported.diagrams.length, 1, 'genera una vista')
  assertEqual(imported.diagrams[0].elements.length, 3, 'genera un elemento por classifier')
  assertEqual(imported.diagrams[0].elements[0].x, 40, 'usa posicion determinista X')
  assertEqual(imported.diagrams[0].elements[0].y, 40, 'usa posicion determinista Y')
  assert(imported.warnings.some((warning) => warning.includes('geometria')), 'advierte geometria sintetica')
})

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1
