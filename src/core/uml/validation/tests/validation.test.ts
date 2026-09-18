// src/core/uml/validation/tests/validation.test.ts
// Tests de la capa de validacion UML 2.5+.
//
// Ejecutar con: npx tsx src/core/uml/validation/tests/validation.test.ts

import { createServer } from 'vite'

import {
  UML_APP_FORMAT_VERSION,
  UML_VERSION,
} from '../../uml.model'
import type {
  UMLAssociation,
  UMLClass,
  UMLInterface,
  UMLModel,
} from '../../uml.model'
import type { UMLDiagramView } from '../../uml.visual'
import { validateUmlModel } from '../validateUmlModel'
import { validateUmlView } from '../validateUmlView'
import type { UMLValidationCode, UMLValidationResult } from '../validation.types'

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

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    console.log(`\n▶ ${name}`)
    await fn()
    pass++
  } catch (e) {
    fail++
    console.error(`  ✗ ${name}: ${e}`)
  }
}

function hasIssue(result: UMLValidationResult, code: UMLValidationCode): boolean {
  return result.issues.some((issue) => issue.code === code && issue.severity === 'error')
}

function makeClass(id: string, name = id): UMLClass {
  return {
    kind: 'class',
    id,
    name,
    visibility: 'public',
    isAbstract: false,
    attributes: [],
    operations: [],
  }
}

function makeInterface(id: string, name = id): UMLInterface {
  return {
    kind: 'interface',
    id,
    name,
    visibility: 'public',
    operations: [],
  }
}

function makeAssociation(id: string, sourceId: string, targetId: string): UMLAssociation {
  return {
    id,
    ends: [
      {
        id: `${id}-end-source`,
        type: { kind: 'classifier', name: sourceId, classifierId: sourceId },
        multiplicity: { lower: 1, upper: 1 },
        isNavigable: false,
        isOrdered: false,
        isUnique: true,
        aggregation: 'none',
      },
      {
        id: `${id}-end-target`,
        type: { kind: 'classifier', name: targetId, classifierId: targetId },
        multiplicity: { lower: 0, upper: '*' },
        isNavigable: false,
        isOrdered: false,
        isUnique: true,
        aggregation: 'none',
      },
    ],
  }
}

function makeModel(partial: Partial<UMLModel> = {}): UMLModel {
  return {
    id: 'model-1',
    name: 'Modelo de prueba',
    umlVersion: UML_VERSION,
    formatVersion: UML_APP_FORMAT_VERSION,
    packages: [],
    classifiers: [],
    associations: [],
    generalizations: [],
    dependencies: [],
    realizations: [],
    associationClasses: [],
    stereotypes: [],
    ...partial,
  }
}

/* =========================================================================
 * MODEL VALIDATION
 * ========================================================================= */

async function main(): Promise<void> {

await runTest('Modelo UML valido: 1 clase, 1 atributo, 1 operacion', () => {
  const model = makeModel({
    classifiers: [
      {
        ...makeClass('class-persona', 'Persona'),
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
        operations: [
          {
            id: 'op-saludar',
            name: 'saludar',
            visibility: 'public',
            parameters: [],
            returnType: { kind: 'primitive', name: 'string' },
            isAbstract: false,
            isStatic: false,
          },
        ],
      },
    ],
  })

  const result = validateUmlModel(model)

  assertEqual(result.valid, true, 'modelo valido')
  assertEqual(result.issues.length, 0, 'sin issues')
})

await runTest('IDs duplicados: dos classifiers con el mismo id', () => {
  const result = validateUmlModel(makeModel({ classifiers: [makeClass('class-a'), makeClass('class-a')] }))

  assert(hasIssue(result, 'DUPLICATE_ID'), 'reporta DUPLICATE_ID')
})

await runTest('Referencia de tipo classifier sin classifierId', () => {
  const model = makeModel({
    classifiers: [
      {
        ...makeClass('class-a'),
        attributes: [
          {
            id: 'attr-ref',
            name: 'ref',
            type: { kind: 'classifier', name: 'B' },
            visibility: 'public',
            multiplicity: { lower: 1, upper: 1 },
            isOrdered: false,
            isUnique: true,
            isReadOnly: false,
            isStatic: false,
            isDerived: false,
            aggregation: 'none',
          },
        ],
      },
    ],
  })

  assert(hasIssue(validateUmlModel(model), 'MISSING_REFERENCE'), 'reporta referencia faltante')
})

await runTest('Referencia de tipo classifier con classifierId inexistente', () => {
  const model = makeModel({
    classifiers: [
      {
        ...makeClass('class-a'),
        attributes: [
          {
            id: 'attr-ref',
            name: 'ref',
            type: { kind: 'classifier', name: 'B', classifierId: 'class-b' },
            visibility: 'public',
            multiplicity: { lower: 1, upper: 1 },
            isOrdered: false,
            isUnique: true,
            isReadOnly: false,
            isStatic: false,
            isDerived: false,
            aggregation: 'none',
          },
        ],
      },
    ],
  })

  assert(hasIssue(validateUmlModel(model), 'MISSING_REFERENCE'), 'reporta classifierId inexistente')
})

await runTest('Multiplicidad invalida: lower negativo', () => {
  const model = makeModel({ classifiers: [{ ...makeClass('class-a'), attributes: [makeAttributeWithMultiplicity('attr-m', -1, 1)] }] })

  assert(hasIssue(validateUmlModel(model), 'INVALID_MULTIPLICITY'), 'reporta lower negativo')
})

await runTest('Multiplicidad invalida: upper negativo', () => {
  const model = makeModel({ classifiers: [{ ...makeClass('class-a'), attributes: [makeAttributeWithMultiplicity('attr-m', 0, -1)] }] })

  assert(hasIssue(validateUmlModel(model), 'INVALID_MULTIPLICITY'), 'reporta upper negativo')
})

await runTest('Multiplicidad invalida: lower mayor que upper', () => {
  const model = makeModel({ classifiers: [{ ...makeClass('class-a'), attributes: [makeAttributeWithMultiplicity('attr-m', 2, 1)] }] })

  assert(hasIssue(validateUmlModel(model), 'INVALID_MULTIPLICITY'), 'reporta lower mayor que upper')
})

await runTest('Multiplicidad invalida: valores no enteros', () => {
  const model = makeModel({ classifiers: [{ ...makeClass('class-a'), attributes: [makeAttributeWithMultiplicity('attr-m', 0.5, 1.5)] }] })

  assert(hasIssue(validateUmlModel(model), 'INVALID_MULTIPLICITY'), 'reporta valores no enteros')
})

await runTest('Generalization valida: A hereda de B', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeClass('class-b')],
    generalizations: [{ id: 'gen-a-b', specificId: 'class-a', generalId: 'class-b' }],
  })

  assertEqual(validateUmlModel(model).valid, true, 'generalizacion valida')
})

await runTest('Generalization invalida: self cycle A -> A', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a')],
    generalizations: [{ id: 'gen-a-a', specificId: 'class-a', generalId: 'class-a' }],
  })

  assertEqual(validateUmlModel(model).valid, false, 'self cycle debe invalidar el modelo')
})

await runTest('Generalization invalida: ciclo indirecto A -> B -> C -> A', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeClass('class-b'), makeClass('class-c')],
    generalizations: [
      { id: 'gen-a-b', specificId: 'class-a', generalId: 'class-b' },
      { id: 'gen-b-c', specificId: 'class-b', generalId: 'class-c' },
      { id: 'gen-c-a', specificId: 'class-c', generalId: 'class-a' },
    ],
  })

  assertEqual(validateUmlModel(model).valid, false, 'ciclo indirecto debe invalidar el modelo')
})

await runTest('Association valida con dos extremos', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeClass('class-b')],
    associations: [makeAssociation('assoc-a-b', 'class-a', 'class-b')],
  })

  assertEqual(validateUmlModel(model).valid, true, 'asociacion binaria valida')
})

await runTest('Association invalida con un solo extremo', () => {
  const association = makeAssociation('assoc-a-b', 'class-a', 'class-b')
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeClass('class-b')],
    associations: [{ ...association, ends: [association.ends[0]] }],
  })

  assertEqual(validateUmlModel(model).valid, false, 'asociacion con un extremo debe invalidar el modelo')
})

await runTest('Association end apuntando a classifier inexistente', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a')],
    associations: [makeAssociation('assoc-a-b', 'class-a', 'class-b')],
  })

  assert(hasIssue(validateUmlModel(model), 'MISSING_REFERENCE'), 'reporta end con classifier inexistente')
})

await runTest('AssociationClass valida', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeClass('class-b'), makeClass('class-ab')],
    associations: [makeAssociation('assoc-a-b', 'class-a', 'class-b')],
    associationClasses: [{ id: 'ac-a-b', classId: 'class-ab', associationId: 'assoc-a-b' }],
  })

  assertEqual(validateUmlModel(model).valid, true, 'association class valida')
})

await runTest('AssociationClass con classId inexistente', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeClass('class-b')],
    associations: [makeAssociation('assoc-a-b', 'class-a', 'class-b')],
    associationClasses: [{ id: 'ac-a-b', classId: 'class-ab', associationId: 'assoc-a-b' }],
  })

  assert(hasIssue(validateUmlModel(model), 'MISSING_REFERENCE'), 'reporta classId inexistente')
})

await runTest('AssociationClass con associationId inexistente', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeClass('class-b'), makeClass('class-ab')],
    associationClasses: [{ id: 'ac-a-b', classId: 'class-ab', associationId: 'assoc-a-b' }],
  })

  assert(hasIssue(validateUmlModel(model), 'MISSING_REFERENCE'), 'reporta associationId inexistente')
})

await runTest('Realization valida: clase implementa interface', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeInterface('interface-a')],
    realizations: [{ id: 'real-a', clientId: 'class-a', supplierId: 'interface-a' }],
  })

  assertEqual(validateUmlModel(model).valid, true, 'realizacion valida')
})

await runTest('Realization con supplier que no es interface segun comportamiento actual', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a'), makeClass('class-b')],
    realizations: [{ id: 'real-a', clientId: 'class-a', supplierId: 'class-b' }],
  })

  assertEqual(validateUmlModel(model).valid, true, 'actualmente solo se valida existencia de referencias')
})

await runTest('Dependency con referencia inexistente', () => {
  const model = makeModel({
    classifiers: [makeClass('class-a')],
    dependencies: [{ id: 'dep-a-b', clientId: 'class-a', supplierId: 'class-b' }],
  })

  assert(hasIssue(validateUmlModel(model), 'MISSING_REFERENCE'), 'reporta supplierId inexistente')
})

/* =========================================================================
 * VIEW VALIDATION
 * ========================================================================= */

await runTest('UMLDiagramView valida con referencias existentes', () => {
  const model = makeModel({ classifiers: [makeClass('class-a'), makeClass('class-b')], associations: [makeAssociation('assoc-a-b', 'class-a', 'class-b')] })
  const view: UMLDiagramView = {
    id: 'view-1',
    elements: [
      { id: 've-a', semanticElementId: 'class-a', x: 0, y: 0, width: 100, height: 80 },
      { id: 've-b', semanticElementId: 'class-b', x: 200, y: 0, width: 100, height: 80 },
    ],
    links: [{ id: 'vl-ab', semanticElementId: 'assoc-a-b', sourceElementId: 've-a', targetElementId: 've-b' }],
  }

  assertEqual(validateUmlView(view, model).valid, true, 'vista valida')
})

await runTest('UMLDiagramView con semanticElement inexistente', () => {
  const model = makeModel({ classifiers: [makeClass('class-a')] })
  const view: UMLDiagramView = {
    id: 'view-1',
    elements: [{ id: 've-x', semanticElementId: 'class-x', x: 0, y: 0, width: 100, height: 80 }],
  }

  assert(hasIssue(validateUmlView(view, model), 'MISSING_REFERENCE'), 'reporta semanticElement inexistente')
})

await runTest('UMLDiagramView link con source/target inexistente', () => {
  const model = makeModel({ classifiers: [makeClass('class-a')], dependencies: [{ id: 'dep-a-a', clientId: 'class-a', supplierId: 'class-a' }] })
  const view: UMLDiagramView = {
    id: 'view-1',
    elements: [{ id: 've-a', semanticElementId: 'class-a', x: 0, y: 0, width: 100, height: 80 }],
    links: [{ id: 'vl-dep', semanticElementId: 'dep-a-a', sourceElementId: 've-x', targetElementId: 've-y' }],
  }

  assert(hasIssue(validateUmlView(view, model), 'MISSING_REFERENCE'), 'reporta source/target inexistente')
})

/* =========================================================================
 * CANVAS INTEGRATION
 * ========================================================================= */

await runTest('Integracion: canvasToUml() -> validateUmlModel()', async () => {
  const server = await createServer({ logLevel: 'silent' })
  try {
    const { canvasToUml } = await server.ssrLoadModule('/src/modules/editor/adapters/canvasToUml.ts') as typeof import('../../../../modules/editor/adapters/canvasToUml')
    const { case1_simpleClass } = await server.ssrLoadModule('/src/modules/editor/adapters/tests/fixtures.ts') as typeof import('../../../../modules/editor/adapters/tests/fixtures')

    const { model } = canvasToUml(case1_simpleClass)
    const result = validateUmlModel(model)

    assertEqual(result.valid, true, 'modelo generado por canvasToUml es valido')
  } finally {
    await server.close()
  }
})

function makeAttributeWithMultiplicity(id: string, lower: number, upper: number | '*'): UMLClass['attributes'][number] {
  return {
    id,
    name: 'items',
    type: { kind: 'primitive', name: 'string' },
    visibility: 'public',
    multiplicity: { lower, upper },
    isOrdered: false,
    isUnique: true,
    isReadOnly: false,
    isStatic: false,
    isDerived: false,
    aggregation: 'none',
  }
}

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
