// src/modules/editor/adapters/tests/canvasToUmlProjectDocument.test.ts
// Tests del adapter Canvas -> UMLProjectDocument.
//
// Ejecutar con: npx tsx src/modules/editor/adapters/tests/canvasToUmlProjectDocument.test.ts

import type { DiagramModel } from '@/modules/editor/services/canvas.engine'
import { canvasSnapshotToUmlProjectDocument } from '../canvasToUmlProjectDocument'

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

function makeSnapshot(): DiagramModel {
  return {
    classes: {
      'cls-persona': {
        id: 'cls-persona',
        x: 100,
        y: 100,
        w: 170,
        h: 100,
        name: 'Persona',
        attributes: ['+ nombre: string'],
        methods: [],
      },
      'cls-mascota': {
        id: 'cls-mascota',
        x: 400,
        y: 100,
        w: 170,
        h: 80,
        name: 'Mascota',
        attributes: [],
        methods: [],
      },
    },
    links: {
      'link-persona-mascota': {
        id: 'link-persona-mascota',
        kind: 'Associate',
        sourceId: 'cls-persona',
        targetId: 'cls-mascota',
        labels: { name: 'adopta', src: '1', tgt: '0..*' },
        anchorSrc: null,
        anchorTgt: null,
      },
    },
  }
}

runTest('Canvas snapshot simple -> UMLProjectDocument validado', () => {
  const result = canvasSnapshotToUmlProjectDocument(makeSnapshot(), {
    documentId: 'project-1',
    documentName: 'Proyecto UML',
    modelId: 'model-1',
    viewId: 'view-1',
  })

  assert(result.document.model !== undefined, 'document.model existe')
  assertEqual(result.document.id, 'project-1', 'document id correcto')
  assertEqual(result.document.name, 'Proyecto UML', 'document name correcto')
  assertEqual(result.document.diagrams.length, 1, 'diagrams contiene la vista')
  assertEqual(result.document.diagrams[0].id, 'view-1', 'vista correcta')
  assertEqual(result.document.activeDiagramId, 'view-1', 'activeDiagramId correcto')
  assertEqual(result.modelValidation.valid, true, 'validateUmlModel pasa')
  assertEqual(result.viewValidation.valid, true, 'validateUmlView pasa')
  assertEqual(result.warnings.length, 0, 'sin warnings')
})

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1
