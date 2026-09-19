// src/core/uml/persistence/tests/umlProjectFile.test.ts
// Tests de persistencia local de UMLProjectDocument.
//
// Ejecutar con: npx tsx src/core/uml/persistence/tests/umlProjectFile.test.ts

import { UML_APP_FORMAT_VERSION, UML_VERSION } from '../../uml.model'
import type { UMLModel } from '../../uml.model'
import type { UMLProjectDocument } from '../../uml.project'
import type { UMLDiagramView } from '../../uml.visual'
import {
  loadUmlProjectDocumentFromJson,
  serializeUmlProjectDocument,
} from '../../uml.project.serialization'
import { normalizeUmlProjectFilename } from '../umlProjectFile'

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

function makeModel(): UMLModel {
  return {
    id: 'model-1',
    name: 'Sistema',
    umlVersion: UML_VERSION,
    formatVersion: UML_APP_FORMAT_VERSION,
    packages: [],
    classifiers: [
      {
        kind: 'class',
        id: 'class-persona',
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
    ],
    associations: [],
    generalizations: [],
    dependencies: [],
    realizations: [],
    associationClasses: [],
    stereotypes: [],
  }
}

function makeView(): UMLDiagramView {
  return {
    id: 'view-1',
    name: 'Vista principal',
    elements: [
      {
        id: 've-class-persona',
        semanticElementId: 'class-persona',
        x: 100,
        y: 80,
        width: 180,
        height: 100,
      },
    ],
    links: [],
  }
}

function makeDocument(): UMLProjectDocument {
  const view = makeView()

  return {
    id: 'project-1',
    name: 'Sistema',
    formatVersion: UML_APP_FORMAT_VERSION,
    model: makeModel(),
    diagrams: [view],
    activeDiagramId: view.id,
  }
}

runTest('normalizeUmlProjectFilename', () => {
  assertEqual(normalizeUmlProjectFilename('Sistema'), 'Sistema.umlproject', 'agrega extension')
  assertEqual(normalizeUmlProjectFilename('Sistema.umlproject'), 'Sistema.umlproject', 'no duplica extension')
  assertEqual(normalizeUmlProjectFilename(''), 'uml-project.umlproject', 'nombre vacio usa default')
  assertEqual(normalizeUmlProjectFilename('   '), 'uml-project.umlproject', 'espacios usa default')
})

runTest('UMLProjectDocument -> JSON -> UMLProjectDocument validado', () => {
  const source = makeDocument()
  const json = serializeUmlProjectDocument(source)
  const result = loadUmlProjectDocumentFromJson(json)

  assert(result.document !== undefined, 'document existe')
  assert(result.validation !== undefined, 'validation existe')
  assertEqual(result.validation?.valid, true, 'validation.valid es true')

  assertEqual(result.document?.id, source.id, 'id conservado')
  assertEqual(result.document?.name, source.name, 'name conservado')
  assertEqual(result.document?.formatVersion, source.formatVersion, 'formatVersion conservado')
  assertEqual(result.document?.model, source.model, 'model conservado')
  assertEqual(result.document?.diagrams, source.diagrams, 'diagrams conservado')
  assertEqual(result.document?.activeDiagramId, source.activeDiagramId, 'activeDiagramId conservado')
})

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1
