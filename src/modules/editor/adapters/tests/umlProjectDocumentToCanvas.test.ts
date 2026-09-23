// src/modules/editor/adapters/tests/umlProjectDocumentToCanvas.test.ts
// Tests del adapter UMLProjectDocument -> Canvas.
//
// Ejecutar con: npx tsx src/modules/editor/adapters/tests/umlProjectDocumentToCanvas.test.ts

import { UML_APP_FORMAT_VERSION, UML_VERSION } from '@/core/uml'
import type { UMLProjectDocument } from '@/core/uml'
import { umlProjectDocumentToCanvas } from '../umlProjectDocumentToCanvas'

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
  return {
    id: 'project-1',
    name: 'Proyecto UML',
    formatVersion: UML_APP_FORMAT_VERSION,
    activeDiagramId: 'view-1',
    model: {
      id: 'model-1',
      name: 'Modelo UML',
      umlVersion: UML_VERSION,
      formatVersion: UML_APP_FORMAT_VERSION,
      packages: [],
      classifiers: [
        {
          kind: 'class',
          id: 'cls-persona',
          name: 'Persona',
          visibility: 'public',
          isAbstract: false,
          attributes: [
            {
              id: 'attr-nombre',
              name: 'nombre',
              type: { kind: 'primitive', name: 'string' },
              visibility: 'private',
              multiplicity: { lower: 1, upper: 1 },
              isOrdered: false,
              isUnique: true,
              isReadOnly: false,
              isStatic: false,
              isDerived: false,
              aggregation: 'none',
            },
          ],
          operations: [],
        },
        {
          kind: 'class',
          id: 'cls-mascota',
          name: 'Mascota',
          visibility: 'public',
          isAbstract: false,
          attributes: [],
          operations: [],
        },
      ],
      associations: [
        {
          id: 'assoc-persona-mascota',
          name: 'adopta',
          ends: [
            {
              id: 'end-persona',
              type: { kind: 'classifier', name: 'Persona', classifierId: 'cls-persona' },
              role: 'duenio',
              multiplicity: { lower: 1, upper: 1 },
              isNavigable: false,
              isOrdered: false,
              isUnique: true,
              aggregation: 'none',
            },
            {
              id: 'end-mascota',
              type: { kind: 'classifier', name: 'Mascota', classifierId: 'cls-mascota' },
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
      generalizations: [],
      dependencies: [],
      realizations: [],
      associationClasses: [],
      stereotypes: [],
    },
    diagrams: [
      {
        id: 'view-1',
        name: 'Vista principal',
        elements: [
          { id: 've-cls-persona', semanticElementId: 'cls-persona', x: 120, y: 80, width: 190, height: 110 },
          { id: 've-cls-mascota', semanticElementId: 'cls-mascota', x: 420, y: 90, width: 180, height: 90 },
        ],
        links: [
          {
            id: 'vl-assoc-persona-mascota',
            semanticElementId: 'assoc-persona-mascota',
            sourceElementId: 've-cls-persona',
            targetElementId: 've-cls-mascota',
            anchorSrc: { side: 'R', t: 0.5 },
            anchorTgt: { side: 'L', t: 0.5 },
          },
        ],
      },
    ],
  }
}

runTest('UMLProjectDocument simple -> Canvas snapshot', () => {
  const result = umlProjectDocumentToCanvas(makeDocument())
  const snapshot = result.model

  assert(snapshot.classes['cls-persona'] !== undefined, 'clase Persona visible')
  assert(snapshot.classes['cls-mascota'] !== undefined, 'clase Mascota visible')
  assertEqual(snapshot.classes['cls-persona'].x, 120, 'posicion x conservada')
  assertEqual(snapshot.classes['cls-persona'].y, 80, 'posicion y conservada')
  assertEqual(snapshot.classes['cls-persona'].w, 190, 'width conservado')
  assertEqual(snapshot.classes['cls-persona'].h, 110, 'height conservado')

  const link = snapshot.links['assoc-persona-mascota']
  assert(link !== undefined, 'relacion visible')
  assertEqual(link.sourceId, 'cls-persona', 'sourceId semantico conservado')
  assertEqual(link.targetId, 'cls-mascota', 'targetId semantico conservado')
  assertEqual(link.labels?.name, 'adopta', 'nombre de relacion conservado')
  assertEqual(link.labels?.src, '1', 'multiplicidad source conservada')
  assertEqual(link.labels?.tgt, '0..*', 'multiplicidad target conservada')
  assertEqual(link.anchorSrc, { side: 'R', t: 0.5 }, 'anchor source conservada')
  assertEqual(link.anchorTgt, { side: 'L', t: 0.5 }, 'anchor target conservada')
})

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1
