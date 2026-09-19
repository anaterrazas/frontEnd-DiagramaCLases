// src/core/uml/xmi/tests/exportUmlToXmi.test.ts
// Tests de exportacion XMI UML 2.5.1.
//
// Ejecutar con: npx tsx src/core/uml/xmi/tests/exportUmlToXmi.test.ts

import { UML_APP_FORMAT_VERSION, UML_VERSION } from '../../uml.model'
import type { UMLModel } from '../../uml.model'
import { exportUmlModelToXmi } from '../exportUmlToXmi'

let pass = 0
let fail = 0

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`)
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
    name: 'Modelo XMI',
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

const result = exportUmlModelToXmi(makeModel())
const xmi = result.xmi

runTest('Exporta UMLClass', () => {
  assert(xmi.includes('xmi:type="uml:Class"'), 'incluye uml:Class')
  assert(xmi.includes('xmi:id="class-persona"'), 'incluye id de clase')
  assert(xmi.includes('name="Persona"'), 'incluye nombre de clase')
})

runTest('Exporta UMLProperty', () => {
  assert(xmi.includes('<ownedAttribute'), 'incluye ownedAttribute')
  assert(xmi.includes('xmi:id="attr-nombre"'), 'incluye id de atributo')
  assert(xmi.includes('name="nombre"'), 'incluye nombre de atributo')
  assert(xmi.includes('type="String"'), 'incluye tipo de atributo')
})

runTest('Exporta UMLOperation', () => {
  assert(xmi.includes('<ownedOperation'), 'incluye ownedOperation')
  assert(xmi.includes('xmi:id="op-saludar"'), 'incluye id de operacion')
  assert(xmi.includes('name="saludar"'), 'incluye nombre de operacion')
})

runTest('Exporta UMLParameter', () => {
  assert(xmi.includes('<ownedParameter'), 'incluye ownedParameter')
  assert(xmi.includes('xmi:id="param-mensaje"'), 'incluye id de parametro')
  assert(xmi.includes('direction="in"'), 'incluye direccion del parametro')
  assert(xmi.includes('xmi:id="op-saludar-return"'), 'incluye parametro return sintetico')
  assert(xmi.includes('direction="return"'), 'incluye direccion return')
})

runTest('Exporta UMLGeneralization', () => {
  assert(xmi.includes('<generalization'), 'incluye generalization')
  assert(xmi.includes('xmi:id="gen-empleado-persona"'), 'incluye id de generalizacion')
  assert(xmi.includes('general="class-persona"'), 'incluye classifier general')
})

runTest('Exporta UMLAssociation', () => {
  assert(xmi.includes('xmi:type="uml:Association"'), 'incluye uml:Association')
  assert(xmi.includes('xmi:id="assoc-persona-mascota"'), 'incluye id de asociacion')
  assert(xmi.includes('memberEnd="end-persona end-mascota"'), 'incluye memberEnd')
  assert(xmi.includes('<ownedEnd'), 'incluye ownedEnd')
  assert(xmi.includes('upperValue xmi:type="uml:LiteralUnlimitedNatural"'), 'incluye multiplicidad superior')
  assert(xmi.includes('value="*"'), 'incluye multiplicidad ilimitada')
})

runTest('Exporta UMLDependency', () => {
  assert(xmi.includes('xmi:type="uml:Dependency"'), 'incluye uml:Dependency')
  assert(xmi.includes('xmi:id="dep-persona-repo"'), 'incluye id de dependencia')
  assert(xmi.includes('client="class-persona"'), 'incluye client')
  assert(xmi.includes('supplier="interface-repo"'), 'incluye supplier')
})

runTest('Exporta UMLRealization', () => {
  assert(xmi.includes('xmi:type="uml:Realization"'), 'incluye uml:Realization')
  assert(xmi.includes('xmi:id="real-persona-repo"'), 'incluye id de realizacion')
})

runTest('XML generado es valido', () => {
  assert(xmi.includes('xmi:version="2.5.1"'), 'incluye version XMI 2.5.1')
  assert(xmi.includes('xmlns:xmi="http://www.omg.org/spec/XMI/20131001"'), 'incluye namespace XMI')
  assert(xmi.includes('xmlns:uml="http://www.eclipse.org/uml2/5.0.0/UML"'), 'incluye namespace UML')
  assertXmlWellFormed(xmi)
})

function assertXmlWellFormed(xml: string): void {
  const stack: string[] = []
  const tags = xml.match(/<[^>]+>/g) ?? []

  for (const tag of tags) {
    if (tag.startsWith('<?') || tag.startsWith('<!--')) {
      continue
    }

    if (tag.startsWith('</')) {
      const tagName = tag.slice(2, -1).trim()
      const expected = stack.pop()
      assert(expected === tagName, `cierre XML esperado ${expected}, recibido ${tagName}`)
      continue
    }

    if (tag.endsWith('/>')) {
      continue
    }

    const tagName = tag.slice(1, -1).trim().split(/\s+/)[0]
    stack.push(tagName)
  }

  assert(stack.length === 0, 'XML bien formado')
}

console.log(`\n=== RESULTADO ===`)
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
if (fail > 0) process.exitCode = 1
