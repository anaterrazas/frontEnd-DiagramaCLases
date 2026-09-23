// src/core/uml/xmi/tests/xmiRoundTrip.test.ts
// Pruebas round-trip UMLModel <-> XMI.
//
// Ejecutar con: npx tsx src/core/uml/xmi/tests/xmiRoundTrip.test.ts

import { UML_APP_FORMAT_VERSION, UML_VERSION } from '../../uml.model'
import type { UMLClass, UMLClassifier, UMLInterface, UMLModel } from '../../uml.model'
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
    id: 'model-round-trip',
    name: 'Modelo Round Trip',
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
          {
            id: 'attr-tags',
            name: 'tags',
            type: { kind: 'primitive', name: 'String' },
            visibility: 'public',
            multiplicity: { lower: 0, upper: '*' },
            isOrdered: true,
            isUnique: false,
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
        id: 'interface-repositorio',
        name: 'Repositorio',
        visibility: 'public',
        operations: [
          {
            id: 'op-guardar',
            name: 'guardar',
            visibility: 'public',
            parameters: [
              {
                id: 'param-entidad',
                name: 'entidad',
                type: { kind: 'classifier', name: 'Persona', classifierId: 'class-persona' },
                direction: 'in',
                multiplicity: { lower: 1, upper: 1 },
              },
            ],
            isAbstract: false,
            isStatic: false,
          },
        ],
      },
      {
        kind: 'enumeration',
        id: 'enum-estado',
        name: 'Estado',
        visibility: 'public',
        literals: [
          { id: 'literal-activo', name: 'ACTIVO' },
          { id: 'literal-inactivo', name: 'INACTIVO' },
        ],
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
      { id: 'dep-persona-repo', clientId: 'class-persona', supplierId: 'interface-repositorio' },
    ],
    realizations: [
      { id: 'real-persona-repo', clientId: 'class-persona', supplierId: 'interface-repositorio' },
    ],
    associationClasses: [],
    stereotypes: [],
  }
}

runTest('Round-trip conserva semantica critica', () => {
  const source = makeModel()
  const exported = exportUmlModelToXmi(source)
  const imported = importXmiToUmlModel(exported.xmi)

  assertEqual(imported.errors.length, 0, 'import sin errores')
  assert(imported.model !== undefined, 'modelo importado existente')
  assertEqual(validateUmlModel(imported.model!).valid, true, 'modelo importado valido')

  const importedModel = imported.model!

  assertEqual(classifierNames(importedModel), classifierNames(source), 'conserva nombres de classifiers')
  assertEqual(classifierKinds(importedModel), classifierKinds(source), 'conserva tipos de classifiers')
  assertClassSemantics(importedModel, 'Persona')
  assertInterfaceSemantics(importedModel, 'Repositorio')
  assertEnumerationSemantics(importedModel, 'Estado')
  assertRelations(importedModel)
})

function classifierNames(model: UMLModel): string[] {
  return model.classifiers.map((classifier) => classifier.name).sort()
}

function classifierKinds(model: UMLModel): Array<{ name: string; kind: UMLClassifier['kind'] }> {
  return model.classifiers
    .map((classifier) => ({ name: classifier.name, kind: classifier.kind }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function findClassifier(model: UMLModel, name: string): UMLClassifier | undefined {
  return model.classifiers.find((classifier) => classifier.name === name)
}

function assertClassSemantics(model: UMLModel, name: string): void {
  const classifier = findClassifier(model, name)
  assert(classifier?.kind === 'class', `${name} es clase`)
  if (classifier?.kind !== 'class') return

  const umlClass: UMLClass = classifier
  const attrNames = umlClass.attributes.map((attribute) => attribute.name).sort()
  const operationNames = umlClass.operations.map((operation) => operation.name).sort()

  assertEqual(attrNames, ['nombre', 'tags'], 'conserva atributos de clase')
  assertEqual(operationNames, ['saludar'], 'conserva operaciones de clase')
  assertEqual(umlClass.attributes.find((attribute) => attribute.name === 'tags')?.multiplicity, { lower: 0, upper: '*' }, 'conserva multiplicidad * de atributo')
  assertEqual(umlClass.operations[0].parameters[0].name, 'mensaje', 'conserva parametro')
  assertEqual(umlClass.operations[0].returnType?.name, 'String', 'conserva returnType')
}

function assertInterfaceSemantics(model: UMLModel, name: string): void {
  const classifier = findClassifier(model, name)
  assert(classifier?.kind === 'interface', `${name} es interface`)
  if (classifier?.kind !== 'interface') return

  const umlInterface: UMLInterface = classifier
  assertEqual(umlInterface.operations.map((operation) => operation.name), ['guardar'], 'conserva operacion de interface')
  assertEqual(umlInterface.operations[0].parameters[0].type.kind, 'classifier', 'conserva parametro classifier')
}

function assertEnumerationSemantics(model: UMLModel, name: string): void {
  const classifier = findClassifier(model, name)
  assert(classifier?.kind === 'enumeration', `${name} es enumeration`)
  if (classifier?.kind !== 'enumeration') return

  assertEqual(classifier.literals.map((literal) => literal.name).sort(), ['ACTIVO', 'INACTIVO'], 'conserva literals')
}

function assertRelations(model: UMLModel): void {
  assertEqual(model.generalizations.length, 1, 'conserva generalization')
  assertEqual(model.associations.length, 1, 'conserva association')
  assertEqual(model.dependencies.length, 1, 'conserva dependency')
  assertEqual(model.realizations.length, 1, 'conserva realization')

  const association = model.associations[0]
  assertEqual(association.name, 'adopta', 'conserva nombre de association')
  assertEqual(association.ends.map((end) => end.role).sort(), ['duenio', 'mascotas'], 'conserva roles de association')
  assertEqual(association.ends.find((end) => end.role === 'mascotas')?.multiplicity, { lower: 0, upper: '*' }, 'conserva multiplicidad de association end')
}

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1
