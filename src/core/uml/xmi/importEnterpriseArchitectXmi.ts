import {
  UML_APP_FORMAT_VERSION,
  UML_VERSION,
  type UMLAssociation,
  type UMLAssociationEnd,
  type UMLClass,
  type UMLClassifier,
  type UMLDependency,
  type UMLDiagramView,
  type UMLEnumeration,
  type UMLGeneralization,
  type UMLInterface,
  type UMLModel,
  type UMLOperation,
  type UMLParameter,
  type UMLProperty,
  type UMLProjectDocument,
  type UMLRealization,
} from '@/core/uml'
import { createUmlProjectDocument } from '@/core/uml'
import { attr, findFirstDescendant, parseXml, type XmiNode } from './xmi.parse'
import type { UMLMultiplicity, UMLTypeReference } from '../uml.types'

export interface EnterpriseArchitectImportResult {
  document?: UMLProjectDocument
  warnings: string[]
  errors: string[]
}

export function importEnterpriseArchitectXmi(xmi: string): EnterpriseArchitectImportResult {
  const warnings: string[] = []
  const parsed = parseXml(xmi)
  if (parsed.root === undefined || parsed.errors.length > 0) {
    return { warnings, errors: parsed.errors }
  }

  const modelNode = findFirstDescendant(parsed.root, (node) => node.name === 'UML:Model')
  if (modelNode === undefined) {
    return { warnings, errors: ['No se encontro UML:Model de Enterprise Architect.'] }
  }

  const datatypeNames = new Map<string, string>()
  for (const node of descendants(modelNode, 'UML:DataType')) {
    const id = attr(node, 'xmi.id') ?? attr(node, 'xmi:id')
    if (id !== undefined) datatypeNames.set(id, attr(node, 'name') ?? id)
  }

  const packageNodes = descendants(modelNode, 'UML:Package')
  const classifierNodes = descendants(modelNode).filter((node) => isClassifier(node.name) && attr(node, 'isRoot') !== 'true' && attr(node, 'name') !== 'EARootClass')
  const classifierNames = new Map<string, string>()
  for (const node of classifierNodes) {
    const id = elementId(node)
    if (id !== undefined) classifierNames.set(id, attr(node, 'name') ?? id)
  }

  const classifiers: UMLClassifier[] = classifierNodes
    .map((node) => parseClassifier(node, classifierNames, datatypeNames, warnings))
    .filter((classifier): classifier is UMLClassifier => classifier !== undefined)

  const associations = descendants(modelNode, 'UML:Association')
    .map((node) => parseAssociation(node, classifierNames, datatypeNames, warnings))
    .filter((association): association is UMLAssociation => association !== undefined)
  const generalizations = descendants(modelNode, 'UML:Generalization')
    .map((node) => parseGeneralization(node))
    .filter((value): value is UMLGeneralization => value !== undefined)
  const dependencies = descendants(modelNode, 'UML:Dependency')
    .map((node) => parseDependency(node))
    .filter((value): value is UMLDependency => value !== undefined)
  const realizations = descendants(modelNode, 'UML:Abstraction')
    .map((node) => parseRealization(node))
    .filter((value): value is UMLRealization => value !== undefined)

  const packages = packageNodes.map((node) => ({
    id: elementId(node) ?? `package-${attr(node, 'name') ?? 'imported'}`,
    name: attr(node, 'name') ?? 'Imported Package',
    classifierIds: descendants(node).filter((child) => isClassifier(child.name)).map(elementId).filter((id): id is string => id !== undefined),
  }))
  const model: UMLModel = {
    id: elementId(modelNode) ?? 'imported-model',
    name: attr(modelNode, 'name') ?? 'Imported EA Model',
    umlVersion: UML_VERSION,
    formatVersion: UML_APP_FORMAT_VERSION,
    packages,
    classifiers,
    associations,
    generalizations,
    dependencies,
    realizations,
    associationClasses: [],
    stereotypes: [],
  }

  const diagrams = parseDiagrams(parsed.root, model, warnings)
  const view = diagrams[0] ?? createFallbackView(model)
  const document = createUmlProjectDocument({
    id: `${model.id}-project`,
    name: model.name,
    model,
    diagrams: [view],
    activeDiagramId: view.id,
  })

  return { document, warnings, errors: [] }
}

function parseClassifier(
  node: XmiNode,
  classifierNames: Map<string, string>,
  datatypeNames: Map<string, string>,
  warnings: string[],
): UMLClassifier | undefined {
  const id = elementId(node)
  if (id === undefined) return undefined
  const common = {
    id,
    name: attr(node, 'name') ?? id,
    visibility: parseVisibility(attr(node, 'visibility')),
  }

  if (node.name === 'UML:Class' || node.name === 'UML:Interface') {
    const properties = descendants(node, 'UML:Attribute').map((child, index) => parseProperty(child, id, index, classifierNames, datatypeNames))
    const operations = descendants(node, 'UML:Operation').map((child, index) => parseOperation(child, id, index, classifierNames, datatypeNames))
    if (node.name === 'UML:Interface') {
      const result: UMLInterface = { kind: 'interface', ...common, operations, attributes: properties }
      return result
    }
    const result: UMLClass = {
      kind: 'class',
      ...common,
      isAbstract: parseBoolean(attr(node, 'isAbstract'), false),
      attributes: properties,
      operations,
    }
    return result
  }

  if (node.name === 'UML:Enumeration') {
    const result: UMLEnumeration = {
      kind: 'enumeration',
      ...common,
      literals: directDescendants(node, 'UML:EnumerationLiteral').map((literal, index) => ({
        id: elementId(literal) ?? `${id}-literal-${index}`,
        name: attr(literal, 'name') ?? `Literal${index + 1}`,
      })),
    }
    return result
  }

  warnings.push(`Classifier EA no soportado ignorado: ${node.name}.`)
  return undefined
}

function parseProperty(
  node: XmiNode,
  ownerId: string,
  index: number,
  classifierNames: Map<string, string>,
  datatypeNames: Map<string, string>,
): UMLProperty {
  const type = parseLegacyType(node, classifierNames, datatypeNames)
  const tags = taggedValues(node)
  return {
    id: elementId(node) ?? `${ownerId}-property-${index}`,
    name: attr(node, 'name') ?? `property${index + 1}`,
    type,
    visibility: parseVisibility(attr(node, 'visibility')),
    multiplicity: parseLegacyMultiplicity(attr(node, 'multiplicity'), tags),
    isOrdered: tags.ordered === '1' || attr(node, 'isOrdered') === 'true',
    isUnique: tags.duplicates !== '1',
    // EA usa changeable="none" en atributos normales; no implica solo lectura.
    isReadOnly: tags.readOnly === 'true' || tags.readOnly === '1',
    isStatic: attr(node, 'ownerScope') === 'classifier',
    isDerived: false,
    defaultValue: attr(descendants(node, 'UML:Attribute.initialValue')[0] ?? emptyNode(), 'body'),
    aggregation: 'none',
  }
}

function parseOperation(
  node: XmiNode,
  ownerId: string,
  index: number,
  classifierNames: Map<string, string>,
  datatypeNames: Map<string, string>,
): UMLOperation {
  const parameterNodes = descendants(node, 'UML:Parameter')
  const parameters: UMLParameter[] = []
  let returnType: UMLTypeReference | undefined
  parameterNodes.forEach((parameterNode, parameterIndex) => {
    const direction = attr(parameterNode, 'kind') ?? attr(parameterNode, 'direction') ?? 'in'
    const parsedType = parseLegacyType(parameterNode, classifierNames, datatypeNames)
    if (direction === 'return') returnType = parsedType
    else parameters.push({
      id: elementId(parameterNode) ?? `${ownerId}-operation-${index}-parameter-${parameterIndex}`,
      name: attr(parameterNode, 'name') ?? `parameter${parameterIndex + 1}`,
      type: parsedType,
      direction: parseDirection(direction),
      multiplicity: { lower: 1, upper: 1 },
    })
  })
  return {
    id: elementId(node) ?? `${ownerId}-operation-${index}`,
    name: attr(node, 'name') ?? `operation${index + 1}`,
    visibility: parseVisibility(attr(node, 'visibility')),
    parameters,
    returnType,
    isAbstract: false,
    isStatic: attr(node, 'ownerScope') === 'classifier',
  }
}

function parseAssociation(
  node: XmiNode,
  classifierNames: Map<string, string>,
  datatypeNames: Map<string, string>,
  warnings: string[],
): UMLAssociation | undefined {
  const id = elementId(node)
  if (id === undefined) return undefined
  const endNodes = descendants(node, 'UML:AssociationEnd')
  const ends = endNodes.map((end, index) => parseAssociationEnd(end, `${id}-end-${index}`, classifierNames, datatypeNames))
  if (ends.length < 2) warnings.push(`La asociacion EA "${id}" tiene menos de dos extremos.`)
  return { id, name: attr(node, 'name'), ends }
}

function parseAssociationEnd(node: XmiNode, fallbackId: string, classifierNames: Map<string, string>, datatypeNames: Map<string, string>): UMLAssociationEnd {
  const typeId = attr(node, 'type')
  return {
    id: elementId(node) ?? fallbackId,
    type: typeReference(typeId, classifierNames, datatypeNames),
    role: attr(node, 'name'),
    multiplicity: parseLegacyMultiplicity(attr(node, 'multiplicity'), taggedValues(node)),
    isNavigable: attr(node, 'isNavigable') !== 'false',
    isOrdered: attr(node, 'isOrdered') === 'true',
    isUnique: true,
    aggregation: parseAggregation(attr(node, 'aggregation')),
  }
}

function parseDiagrams(root: XmiNode, model: UMLModel, warnings: string[]): UMLDiagramView[] {
  return descendants(root, 'UML:Diagram').map((diagram, diagramIndex) => {
    const elements: UMLDiagramView['elements'] = []
    const links: NonNullable<UMLDiagramView['links']> = []
    const visualIdBySemanticId = new Map<string, string>()
    for (const [index, node] of descendants(diagram, 'UML:DiagramElement').entries()) {
      const subject = attr(node, 'subject')
      if (subject === undefined) continue
      const style = attr(node, 'style') ?? ''
      const visualId = style.match(/(?:^|;)DUID=([^;]+)/)?.[1] ?? `view-${subject}`
      const geometry = parseGeometry(attr(node, 'geometry'))
      const relation = relationById(model, subject)
      if (geometry !== undefined) {
        if (model.classifiers.some((classifier) => classifier.id === subject)) {
          elements.push({ id: visualId, semanticElementId: subject, ...geometry })
          visualIdBySemanticId.set(subject, visualId)
        }
      }
      if (relation !== undefined) {
        links.push({
          id: visualId,
          semanticElementId: subject,
          sourceElementId: visualIdBySemanticId.get(relation.sourceId) ?? `view-${relation.sourceId}`,
          targetElementId: visualIdBySemanticId.get(relation.targetId) ?? `view-${relation.targetId}`,
        })
      } else if (geometry === undefined && model.classifiers.some((classifier) => classifier.id === subject)) {
        warnings.push(`No se pudo leer la geometria del elemento EA ${subject}.`)
      }
      void index
    }
    return { id: elementId(diagram) ?? `ea-diagram-${diagramIndex}`, name: attr(diagram, 'name') ?? 'Diagrama EA', elements, links }
  })
}

function relationById(model: UMLModel, id: string): { sourceId: string; targetId: string } | undefined {
  const association = model.associations.find((value) => value.id === id)
  if (association) return { sourceId: association.ends[0]?.type.classifierId ?? '', targetId: association.ends[1]?.type.classifierId ?? '' }
  const generalization = model.generalizations.find((value) => value.id === id)
  if (generalization) return { sourceId: generalization.specificId, targetId: generalization.generalId }
  const dependency = model.dependencies.find((value) => value.id === id)
  if (dependency) return { sourceId: dependency.clientId, targetId: dependency.supplierId }
  return undefined
}

function createFallbackView(model: UMLModel): UMLDiagramView {
  return {
    id: `${model.id}-view`,
    name: 'Vista importada',
    elements: model.classifiers.map((classifier, index) => ({ id: `view-${classifier.id}`, semanticElementId: classifier.id, x: 40 + (index % 4) * 240, y: 40 + Math.floor(index / 4) * 180, width: 180, height: 100 })),
    links: [],
  }
}

function parseLegacyType(node: XmiNode, classifierNames: Map<string, string>, datatypeNames: Map<string, string>): UMLTypeReference {
  const typeNode = descendants(node, 'UML:Classifier')[0]
  const id = typeNode ? attr(typeNode, 'xmi.idref') ?? attr(typeNode, 'xmi:idref') : attr(node, 'type')
  return typeReference(id, classifierNames, datatypeNames, taggedValues(node).type)
}

function typeReference(id: string | undefined, classifierNames: Map<string, string>, datatypeNames: Map<string, string>, fallbackName?: string): UMLTypeReference {
  if (id !== undefined && classifierNames.has(id)) return { kind: 'classifier', name: classifierNames.get(id) ?? id, classifierId: id }
  const name = id !== undefined ? datatypeNames.get(id) ?? id : fallbackName ?? 'Unknown'
  return isPrimitive(name) ? { kind: 'primitive', name: normalizePrimitive(name) } : { kind: 'external', name }
}

function descendants(node: XmiNode, name?: string): XmiNode[] {
  const result: XmiNode[] = []
  for (const child of node.children) {
    if (name === undefined || child.name === name) result.push(child)
    result.push(...descendants(child, name))
  }
  return result
}

function taggedValues(node: XmiNode): Record<string, string> {
  const values: Record<string, string> = {}
  for (const value of descendants(node, 'UML:TaggedValue')) {
    const tag = attr(value, 'tag')
    if (tag !== undefined) values[tag] = attr(value, 'value') ?? ''
  }
  return values
}

function elementId(node: XmiNode): string | undefined {
  return attr(node, 'xmi.id') ?? attr(node, 'xmi:id')
}

function parseGeometry(value: string | undefined): { x: number; y: number; width: number; height: number } | undefined {
  if (value === undefined || !value.includes('Left=')) return undefined
  const get = (name: string): number | undefined => {
    const match = value.match(new RegExp(`${name}=(-?\\d+)`))
    return match ? Number(match[1]) : undefined
  }
  const left = get('Left'); const top = get('Top'); const right = get('Right'); const bottom = get('Bottom')
  if ([left, top, right, bottom].some((number) => number === undefined)) return undefined
  return { x: left!, y: top!, width: right! - left!, height: bottom! - top! }
}

function parseLegacyMultiplicity(value: string | undefined, tags: Record<string, string>): UMLMultiplicity {
  const raw = value ?? (tags.lowerBound !== undefined ? `${tags.lowerBound}..${tags.upperBound ?? tags.lowerBound}` : undefined)
  if (!raw || raw === '*') return { lower: 0, upper: '*' }
  const [lower, upper] = raw.split('..')
  return { lower: Number.parseInt(lower, 10) || 0, upper: upper === '*' ? '*' : Number.parseInt(upper ?? lower, 10) || 1 }
}

function parseVisibility(value: string | undefined): 'public' | 'private' | 'protected' | 'package' {
  return value === 'private' || value === 'protected' || value === 'package' ? value : 'public'
}

function parseDirection(value: string): 'in' | 'out' | 'inout' {
  return value === 'out' || value === 'inout' ? value : 'in'
}

function parseAggregation(value: string | undefined): 'none' | 'shared' | 'composite' {
  return value === 'shared' || value === 'composite' ? value : 'none'
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  return value === 'true' ? true : value === 'false' ? false : fallback
}

function parseGeneralization(node: XmiNode): UMLGeneralization | undefined {
  const id = elementId(node); const specificId = attr(node, 'child') ?? attr(node, 'specific'); const generalId = attr(node, 'parent') ?? attr(node, 'general')
  return id && specificId && generalId ? { id, specificId, generalId } : undefined
}

function parseDependency(node: XmiNode): UMLDependency | undefined {
  const id = elementId(node); const clientId = attr(node, 'client'); const supplierId = attr(node, 'supplier')
  return id && clientId && supplierId ? { id, clientId, supplierId } : undefined
}

function parseRealization(node: XmiNode): UMLRealization | undefined {
  const id = elementId(node); const clientId = attr(node, 'client'); const supplierId = attr(node, 'supplier')
  return id && clientId && supplierId ? { id, clientId, supplierId } : undefined
}

function isClassifier(name: string): boolean {
  return name === 'UML:Class' || name === 'UML:Interface' || name === 'UML:Enumeration'
}

function isPrimitive(value: string): boolean {
  return ['string', 'integer', 'int', 'boolean', 'bool', 'float', 'double', 'date', 'void', 'real'].includes(value.toLowerCase())
}

function normalizePrimitive(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized === 'int') return 'Integer'
  if (normalized === 'bool') return 'Boolean'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function emptyNode(): XmiNode { return { name: '', attributes: {}, children: [] } }
