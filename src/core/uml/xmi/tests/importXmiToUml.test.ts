// src/core/uml/xmi/tests/importXmiToUml.test.ts
// Prueba basica de importacion XMI UML 2.5.1.
//
// Ejecutar con: npx tsx src/core/uml/xmi/tests/importXmiToUml.test.ts

import { UML_APP_FORMAT_VERSION, UML_VERSION } from '../../uml.model'
import type { UMLModel } from '../../uml.model'
import { validateUmlModel } from '../../validation'
import { exportUmlModelToXmi } from '../exportUmlToXmi'
import { importXmiToUmlModel } from '../importXmiToUml'

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
    name: 'Modelo RoundTrip',
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
            type: { kind: 'primitive', name: 'String' },
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
      },
      {
        kind: 'class',
        id: 'class-empleado',
        name: 'Empleado',
        visibility: 'public',
        isAbstract: false,
        attributes: [],
        operations: [],
      },
      {
        kind: 'class',
        id: 'class-mascota',
        name: 'Mascota',
        visibility: 'public',
        isAbstract: false,
        attributes: [],
        operations: [],
      },
      {
        kind: 'interface',
        id: 'interface-repo',
        name: 'Repositorio',
        visibility: 'public',
        operations: [],
      },
      {
        kind: 'enumeration',
        id: 'enum-estado',
        name: 'Estado',
        visibility: 'public',
        literals: [{ id: 'literal-activo', name: 'ACTIVO' }],
      },
    ],
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
      { id: 'gen-empleado-persona', specificId: 'class-empleado', generalId: 'class-persona' },
    ],
    dependencies: [
      { id: 'dep-persona-repo', clientId: 'class-persona', supplierId: 'interface-repo' },
    ],
    realizations: [
      { id: 'real-persona-repo', clientId: 'class-persona', supplierId: 'interface-repo' },
    ],
    associationClasses: [],
    stereotypes: [],
  }
}

runTest('UMLModel -> XMI -> UMLModel importado valido', () => {
  const sourceModel = makeModel()
  const exportResult = exportUmlModelToXmi(sourceModel)
  const importResult = importXmiToUmlModel(exportResult.xmi)

  assertEqual(importResult.errors.length, 0, 'sin errores de importacion')
  assert(importResult.model !== undefined, 'modelo importado existente')

  const importedModel = importResult.model!
  const validation = validateUmlModel(importedModel)

  assertEqual(validation.valid, true, 'modelo importado valido')
  assertEqual(importResult.validation?.valid, true, 'importador ejecuta validateUmlModel')
  assertEqual(importedModel.classifiers.length, 5, 'importa classifiers')
  assertEqual(importedModel.associations.length, 1, 'importa associations')
  assertEqual(importedModel.generalizations.length, 1, 'importa generalizations')
  assertEqual(importedModel.dependencies.length, 1, 'importa dependencies')
  assertEqual(importedModel.realizations.length, 1, 'importa realizations')
})

runTest('Importa atributos, operaciones, parametros y returnType', () => {
  const xmi = exportUmlModelToXmi(makeModel()).xmi
  const importedModel = importXmiToUmlModel(xmi).model!
  const persona = importedModel.classifiers.find((classifier) => classifier.id === 'class-persona')

  assert(persona?.kind === 'class', 'Persona importada como clase')
  if (persona?.kind !== 'class') return

  assertEqual(persona.attributes[0].id, 'attr-nombre', 'importa UMLProperty')
  assertEqual(persona.attributes[0].multiplicity, { lower: 1, upper: 1 }, 'importa multiplicidad de atributo')
  assertEqual(persona.operations[0].id, 'op-saludar', 'importa UMLOperation')
  assertEqual(persona.operations[0].parameters[0].id, 'param-mensaje', 'importa UMLParameter')
  assertEqual(persona.operations[0].returnType?.kind, 'primitive', 'importa returnType')
})

runTest('Importa ownedEnd y UMLTypeReference classifier', () => {
  const xmi = exportUmlModelToXmi(makeModel()).xmi
  const importedModel = importXmiToUmlModel(xmi).model!
  const association = importedModel.associations[0]

  assertEqual(association.ends.length, 2, 'importa ownedEnd')
  assertEqual(association.ends[0].type.kind, 'classifier', 'resuelve type classifier')
  assertEqual(association.ends[1].multiplicity, { lower: 0, upper: '*' }, 'importa upper *')
})

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1
