// src/core/uml/xmi/importXmiToUml.ts
// Importador XMI 2.5.1 para el subconjunto UML semantico del proyecto.

import {
  UML_APP_FORMAT_VERSION,
  UML_VERSION,
} from '../uml.model'
import type {
  UMLAggregation,
  UMLParameterDirection,
  UMLVisibility,
} from '../uml.enums'
import type {
  UMLAssociation,
  UMLAssociationEnd,
  UMLClassifier,
  UMLDependency,
  UMLEnumerationLiteral,
  UMLGeneralization,
  UMLModel,
  UMLOperation,
  UMLParameter,
  UMLProperty,
  UMLRealization,
} from '../uml.model'
import type { UMLMultiplicity, UMLTypeReference } from '../uml.types'
import type { UMLValidationResult } from '../validation'
import { validateUmlModel } from '../validation'
import { attr, childElements, findFirstDescendant, parseXml, type XmiNode } from './xmi.parse'

export interface XmiImportResult {
  model?: UMLModel
  warnings: string[]
  errors: string[]
  validation?: UMLValidationResult
}

const PRIMITIVE_TYPES = new Set(['String', 'Integer', 'Boolean', 'Real', 'UnlimitedNatural', 'string', 'int', 'integer', 'boolean', 'bool', 'float', 'double', 'number'])

export function importXmiToUmlModel(xmi: string): XmiImportResult {
  const warnings: string[] = []
  const errors: string[] = []
  const parsed = parseXml(xmi)

  errors.push(...parsed.errors)

  if (parsed.root === undefined || errors.length > 0) {
    return { warnings, errors }
  }

  const modelNode = parsed.root.name === 'uml:Model'
    ? parsed.root
    : findFirstDescendant(parsed.root, (node) => node.name === 'uml:Model')

  if (modelNode === undefined) {
    return {
      warnings,
      errors: [...errors, 'No se encontro uml:Model en el XMI.'],
    }
  }

  const classifierNodes = childElements(modelNode, 'packagedElement')
    .filter((node) => isClassifierType(attr(node, 'xmi:type')))
  const classifierIndex = new Map<string, string>()

  for (const node of classifierNodes) {
    const id = requireAttr(node, 'xmi:id', errors)
    if (id !== undefined) {
      classifierIndex.set(id, attr(node, 'name') ?? id)
    }
  }

  const classifiers: UMLClassifier[] = []
  const generalizations: UMLGeneralization[] = []

  for (const node of classifierNodes) {
    const classifier = parseClassifier(node, classifierIndex, warnings, errors)
    if (classifier !== undefined) {
      classifiers.push(classifier)
      generalizations.push(...parseGeneralizations(node, classifier.id, errors))
    }
  }

  const associations = childElements(modelNode, 'packagedElement')
    .filter((node) => attr(node, 'xmi:type') === 'uml:Association')
    .map((node) => parseAssociation(node, classifierIndex, warnings, errors))
    .filter((association): association is UMLAssociation => association !== undefined)

  const dependencies = childElements(modelNode, 'packagedElement')
    .filter((node) => attr(node, 'xmi:type') === 'uml:Dependency')
    .map((node) => parseDependency(node, errors))
    .filter((dependency): dependency is UMLDependency => dependency !== undefined)

  const realizations = childElements(modelNode, 'packagedElement')
    .filter((node) => attr(node, 'xmi:type') === 'uml:Realization')
    .map((node) => parseRealization(node, errors))
    .filter((realization): realization is UMLRealization => realization !== undefined)

  const model: UMLModel = {
    id: attr(modelNode, 'xmi:id') ?? 'imported-model',
    name: attr(modelNode, 'name') ?? 'Imported UML Model',
    umlVersion: UML_VERSION,
    formatVersion: UML_APP_FORMAT_VERSION,
    packages: [],
    classifiers,
    associations,
    generalizations,
    dependencies,
    realizations,
    associationClasses: [],
    stereotypes: [],
  }

  const validation = validateUmlModel(model)
  if (!validation.valid) {
    warnings.push('El UMLModel importado contiene errores de validacion.')
  }

  return {
    model,
    warnings,
    errors,
    validation,
  }
}

function parseClassifier(
  node: XmiNode,
  classifierIndex: Map<string, string>,
  warnings: string[],
  errors: string[],
): UMLClassifier | undefined {
  const type = attr(node, 'xmi:type')
  const id = requireAttr(node, 'xmi:id', errors)

  if (id === undefined) {
    return undefined
  }

  const name = attr(node, 'name') ?? id
  const visibility = parseVisibility(attr(node, 'visibility'))

  if (type === 'uml:Class') {
    return {
      kind: 'class',
      id,
      name,
      visibility,
      isAbstract: parseBoolean(attr(node, 'isAbstract'), false),
      attributes: childElements(node, 'ownedAttribute').map((attributeNode) => parseProperty(attributeNode, classifierIndex, warnings)),
      operations: childElements(node, 'ownedOperation').map((operationNode) => parseOperation(operationNode, classifierIndex, warnings)),
    }
  }

  if (type === 'uml:Interface') {
    return {
      kind: 'interface',
      id,
      name,
      visibility,
      attributes: childElements(node, 'ownedAttribute').map((attributeNode) => parseProperty(attributeNode, classifierIndex, warnings)),
      operations: childElements(node, 'ownedOperation').map((operationNode) => parseOperation(operationNode, classifierIndex, warnings)),
    }
  }

  if (type === 'uml:Enumeration') {
    return {
      kind: 'enumeration',
      id,
      name,
      visibility,
      literals: childElements(node, 'ownedLiteral').map(parseEnumerationLiteral),
    }
  }

  warnings.push(`Classifier no soportado ignorado: ${type ?? '(sin xmi:type)'}.`)
  return undefined
}

function parseEnumerationLiteral(node: XmiNode): UMLEnumerationLiteral {
  const id = attr(node, 'xmi:id') ?? generatedId('literal')

  return {
    id,
    name: attr(node, 'name') ?? id,
  }
}

function parseProperty(node: XmiNode, classifierIndex: Map<string, string>, warnings: string[]): UMLProperty {
  const id = attr(node, 'xmi:id') ?? generatedId('property')

  return {
    id,
    name: attr(node, 'name') ?? id,
    type: parseTypeReference(attr(node, 'type'), classifierIndex, warnings),
    visibility: parseVisibility(attr(node, 'visibility')),
    multiplicity: parseMultiplicity(node),
    isOrdered: parseBoolean(attr(node, 'isOrdered'), false),
    isUnique: parseBoolean(attr(node, 'isUnique'), true),
    isReadOnly: parseBoolean(attr(node, 'isReadOnly'), false),
    isStatic: parseBoolean(attr(node, 'isStatic'), false),
    isDerived: parseBoolean(attr(node, 'isDerived'), false),
    defaultValue: attr(childElements(node, 'defaultValue')[0] ?? emptyNode(), 'value'),
    aggregation: parseAggregation(attr(node, 'aggregation')),
  }
}

function parseOperation(node: XmiNode, classifierIndex: Map<string, string>, warnings: string[]): UMLOperation {
  const id = attr(node, 'xmi:id') ?? generatedId('operation')
  const parameters: UMLParameter[] = []
  let returnType: UMLTypeReference | undefined

  for (const parameterNode of childElements(node, 'ownedParameter')) {
    const direction = parseParameterDirection(attr(parameterNode, 'direction'))

    if (direction === 'return') {
      returnType = parseTypeReference(attr(parameterNode, 'type'), classifierIndex, warnings)
    } else {
      parameters.push(parseParameter(parameterNode, classifierIndex, warnings))
    }
  }

  return {
    id,
    name: attr(node, 'name') ?? id,
    visibility: parseVisibility(attr(node, 'visibility')),
    parameters,
    returnType,
    isAbstract: parseBoolean(attr(node, 'isAbstract'), false),
    isStatic: parseBoolean(attr(node, 'isStatic'), false),
    isQuery: attr(node, 'isQuery') === undefined ? undefined : parseBoolean(attr(node, 'isQuery'), false),
  }
}

function parseParameter(node: XmiNode, classifierIndex: Map<string, string>, warnings: string[]): UMLParameter {
  const id = attr(node, 'xmi:id') ?? generatedId('parameter')

  return {
    id,
    name: attr(node, 'name') ?? id,
    type: parseTypeReference(attr(node, 'type'), classifierIndex, warnings),
    direction: parseParameterDirection(attr(node, 'direction')),
    multiplicity: parseMultiplicity(node),
    defaultValue: attr(childElements(node, 'defaultValue')[0] ?? emptyNode(), 'value'),
  }
}

function parseGeneralizations(node: XmiNode, specificId: string, errors: string[]): UMLGeneralization[] {
  return childElements(node, 'generalization')
    .map((generalizationNode) => {
      const id = requireAttr(generalizationNode, 'xmi:id', errors)
      const generalId = requireAttr(generalizationNode, 'general', errors)

      if (id === undefined || generalId === undefined) {
        return undefined
      }

      return { id, specificId, generalId }
    })
    .filter((generalization): generalization is UMLGeneralization => generalization !== undefined)
}

function parseAssociation(
  node: XmiNode,
  classifierIndex: Map<string, string>,
  warnings: string[],
  errors: string[],
): UMLAssociation | undefined {
  const id = requireAttr(node, 'xmi:id', errors)
  if (id === undefined) {
    return undefined
  }

  const memberEndIds = (attr(node, 'memberEnd') ?? '').split(/\s+/).filter(Boolean)
  const ends = childElements(node, 'ownedEnd').map((endNode) => parseAssociationEnd(endNode, classifierIndex, warnings))

  if (memberEndIds.length > 0 && memberEndIds.some((memberEndId) => !ends.some((end) => end.id === memberEndId))) {
    warnings.push(`La asociacion ${id} declara memberEnd que no existe como ownedEnd.`)
  }

  return {
    id,
    name: attr(node, 'name'),
    ends,
    isDerived: attr(node, 'isDerived') === undefined ? undefined : parseBoolean(attr(node, 'isDerived'), false),
  }
}

function parseAssociationEnd(node: XmiNode, classifierIndex: Map<string, string>, warnings: string[]): UMLAssociationEnd {
  const id = attr(node, 'xmi:id') ?? generatedId('association-end')

  return {
    id,
    type: parseTypeReference(attr(node, 'type'), classifierIndex, warnings),
    role: attr(node, 'name'),
    multiplicity: parseMultiplicity(node),
    isNavigable: false,
    isOrdered: parseBoolean(attr(node, 'isOrdered'), false),
    isUnique: parseBoolean(attr(node, 'isUnique'), true),
    aggregation: parseAggregation(attr(node, 'aggregation')),
  }
}

function parseDependency(node: XmiNode, errors: string[]): UMLDependency | undefined {
  const id = requireAttr(node, 'xmi:id', errors)
  const clientId = requireAttr(node, 'client', errors)
  const supplierId = requireAttr(node, 'supplier', errors)

  if (id === undefined || clientId === undefined || supplierId === undefined) {
    return undefined
  }

  return { id, clientId, supplierId }
}

function parseRealization(node: XmiNode, errors: string[]): UMLRealization | undefined {
  const id = requireAttr(node, 'xmi:id', errors)
  const clientId = requireAttr(node, 'client', errors)
  const supplierId = requireAttr(node, 'supplier', errors)

  if (id === undefined || clientId === undefined || supplierId === undefined) {
    return undefined
  }

  return { id, clientId, supplierId }
}

function parseMultiplicity(node: XmiNode): UMLMultiplicity {
  const lowerRaw = attr(childElements(node, 'lowerValue')[0] ?? emptyNode(), 'value')
  const upperRaw = attr(childElements(node, 'upperValue')[0] ?? emptyNode(), 'value')

  return {
    lower: parseInteger(lowerRaw, 1),
    upper: parseUpper(upperRaw),
  }
}

function parseTypeReference(type: string | undefined, classifierIndex: Map<string, string>, warnings: string[]): UMLTypeReference {
  if (type === undefined || type.trim() === '') {
    warnings.push('Se encontro una referencia de tipo vacia; se importo como external Unknown.')
    return { kind: 'external', name: 'Unknown' }
  }

  if (classifierIndex.has(type)) {
    return { kind: 'classifier', name: classifierIndex.get(type) ?? type, classifierId: type }
  }

  if (PRIMITIVE_TYPES.has(type)) {
    return { kind: 'primitive', name: normalizePrimitiveType(type) }
  }

  warnings.push(`No se pudo resolver el tipo "${type}"; se importo como external.`)
  return { kind: 'external', name: type }
}

function isClassifierType(type: string | undefined): boolean {
  return type === 'uml:Class' || type === 'uml:Interface' || type === 'uml:Enumeration'
}

function parseVisibility(value: string | undefined): UMLVisibility {
  if (value === 'private' || value === 'protected' || value === 'package') {
    return value
  }

  return 'public'
}

function parseAggregation(value: string | undefined): UMLAggregation {
  if (value === 'shared' || value === 'composite') {
    return value
  }

  return 'none'
}

function parseParameterDirection(value: string | undefined): UMLParameterDirection {
  if (value === 'out' || value === 'inout' || value === 'return') {
    return value
  }

  return 'in'
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function parseUpper(value: string | undefined): number | '*' {
  if (value === undefined) {
    return 1
  }

  if (value === '*' || value === '-1') {
    return '*'
  }

  return parseInteger(value, 1)
}

function normalizePrimitiveType(value: string): string {
  const normalized = value.toLowerCase()

  if (normalized === 'string') return 'String'
  if (normalized === 'int' || normalized === 'integer') return 'Integer'
  if (normalized === 'bool' || normalized === 'boolean') return 'Boolean'
  if (normalized === 'float' || normalized === 'double' || normalized === 'number' || normalized === 'real') return 'Real'

  return value
}

function requireAttr(node: XmiNode, name: string, errors: string[]): string | undefined {
  const value = attr(node, name)

  if (value === undefined || value.trim() === '') {
    errors.push(`Falta atributo requerido ${name} en ${node.name}.`)
    return undefined
  }

  return value
}

function emptyNode(): XmiNode {
  return { name: '', attributes: {}, children: [] }
}

function generatedId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}
