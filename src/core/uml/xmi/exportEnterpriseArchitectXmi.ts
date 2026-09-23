import type {
  UMLAssociation,
  UMLAssociationEnd,
  UMLClass,
  UMLClassifier,
  UMLDependency,
  UMLGeneralization,
  UMLModel,
  UMLOperation,
  UMLParameter,
  UMLProperty,
  UMLRealization,
} from '../uml.model'
import type { UMLProjectDocument } from '../uml.project'
import type { UMLDiagramElement, UMLDiagramLink, UMLDiagramView } from '../uml.visual'
import { escapeXmlAttribute } from './xmi.escape'

const EA_GEOMETRY_SCALE = 2

export interface EnterpriseArchitectXmiOptions {
  pretty?: boolean
  viewId?: string
}

export interface EnterpriseArchitectXmiResult {
  xmi: string
  warnings: string[]
  errors: string[]
}

/** Legacy XMI 1.1 exporter for Enterprise Architect repository import. */
export function exportEnterpriseArchitectXmi(
  document: UMLProjectDocument,
  options: EnterpriseArchitectXmiOptions = {},
): EnterpriseArchitectXmiResult {
  const warnings: string[] = []
  const errors: string[] = []
  const model = document.model
  const view = selectView(document, options.viewId)
  const packageId = packageIdFor(model)
  const diagramId = diagramIdFor(view)
  const classifiers = model.classifiers
  const visualBySemanticId = new Map(view?.elements.map((element) => [element.semanticElementId, element]) ?? [])
  const primitiveTypes = collectPrimitiveTypes(model)
  const writer = new XmlWriter(options.pretty !== false)

  if (view === undefined) warnings.push('No existe una vista UML; el diagrama no tendra elementos visuales.')

  writer.raw('<?xml version="1.0" encoding="UTF-8"?>')
  writer.open('<XMI xmi.version="1.1" xmlns:UML="omg.org/UML1.3">')
  writer.open('<XMI.header>')
  writer.open('<XMI.documentation>')
  writer.raw('<XMI.exporter>Diagramador de clases</XMI.exporter>')
  writer.raw('<XMI.exporterVersion>1.0</XMI.exporterVersion>')
  writer.close('</XMI.documentation>')
  writer.close('</XMI.header>')

  writer.open('<XMI.content>')
  writeModel(writer, model, packageId, classifiers, primitiveTypes)
  writeDiagram(writer, view, diagramId, packageId, visualBySemanticId, classifiers, warnings)
  writer.close('</XMI.content>')
  writer.selfClosing('<XMI.difference/>')
  writer.open('<XMI.extensions xmi.extender="Enterprise Architect 2.5">')
  writer.selfClosing('<EAModel.paramSub/>')
  writer.close('</XMI.extensions>')
  writer.close('</XMI>')

  return { xmi: writer.toString(), warnings, errors }
}

function writeModel(
  writer: XmlWriter,
  model: UMLModel,
  packageId: string,
  classifiers: UMLClassifier[],
  primitiveTypes: Map<string, string>,
): void {
  writer.open(`<UML:Model${attribute('name', model.name)}${attribute('xmi.id', model.id)}>`)
  writer.open('<UML:Namespace.ownedElement>')
  writer.open(`<UML:Package${attribute('name', model.name)}${attribute('xmi.id', packageId)}${attribute('isRoot', false)}${attribute('isLeaf', false)}${attribute('isAbstract', false)}${attribute('visibility', 'public')}>`)
  writer.open('<UML:Namespace.ownedElement>')

  for (const classifier of classifiers) {
    writeClassifier(writer, classifier, packageId, primitiveTypes)
  }
  for (const association of model.associations) writeAssociation(writer, association)
  for (const generalization of model.generalizations) writeGeneralization(writer, generalization)
  for (const dependency of model.dependencies) writeDependency(writer, dependency)
  for (const realization of model.realizations) writeRealization(writer, realization)
  for (const primitiveType of primitiveTypes) {
    writer.selfClosing(`<UML:DataType${attribute('xmi.id', primitiveType[1])}${attribute('name', primitiveType[0])}${attribute('visibility', 'public')}${attribute('isRoot', false)}${attribute('isLeaf', false)}${attribute('isAbstract', false)}/>`)
  }

  writer.close('</UML:Namespace.ownedElement>')
  writer.close('</UML:Package>')
  writer.close('</UML:Namespace.ownedElement>')
  writer.close('</UML:Model>')
}

function writeClassifier(
  writer: XmlWriter,
  classifier: UMLClassifier,
  packageId: string,
  primitiveTypes: Map<string, string>,
): void {
  if (classifier.kind === 'enumeration') {
    writer.open(`<UML:Enumeration${attribute('name', classifier.name)}${attribute('xmi.id', classifier.id)}${attribute('visibility', classifier.visibility)}${attribute('namespace', packageId)}>`)
    for (const literal of classifier.literals) {
      writer.selfClosing(`<UML:EnumerationLiteral${attribute('name', literal.name)}${attribute('xmi.id', literal.id)}/>`)
    }
    writer.close('</UML:Enumeration>')
    return
  }

  const isInterface = classifier.kind === 'interface'
  writer.open(`<UML:${isInterface ? 'Interface' : 'Class'}${attribute('name', classifier.name)}${attribute('xmi.id', classifier.id)}${attribute('visibility', classifier.visibility)}${attribute('namespace', packageId)}${attribute('isRoot', false)}${attribute('isLeaf', false)}${attribute('isAbstract', 'isAbstract' in classifier ? classifier.isAbstract : false)}${attribute('isActive', false)}>`) 
  writer.open('<UML:Classifier.feature>')

  for (const property of classifier.attributes ?? []) writeProperty(writer, property, primitiveTypes)
  for (const operation of classifier.operations) writeOperation(writer, operation, primitiveTypes)

  writer.close('</UML:Classifier.feature>')
  writer.close(`</UML:${isInterface ? 'Interface' : 'Class'}>`)
}

function writeProperty(writer: XmlWriter, property: UMLProperty, primitiveTypes: Map<string, string>): void {
  writer.open(`<UML:Attribute${attribute('name', property.name)}${attribute('changeable', property.isReadOnly ? 'none' : 'changeable')}${attribute('visibility', property.visibility)}${attribute('ownerScope', property.isStatic ? 'classifier' : 'instance')}${attribute('targetScope', 'instance')}>`)
  writer.open('<UML:Attribute.initialValue>')
  if (property.defaultValue !== undefined) writer.selfClosing(`<UML:Expression${attribute('body', property.defaultValue)}/>`)
  else writer.selfClosing('<UML:Expression/>')
  writer.close('</UML:Attribute.initialValue>')
  writer.open('<UML:StructuralFeature.type>')
  writer.selfClosing(`<UML:Classifier${attribute('xmi.idref', typeId(property.type.name, property.type.classifierId, primitiveTypes))}/>`) 
  writer.close('</UML:StructuralFeature.type>')
  writer.open('<UML:ModelElement.taggedValue>')
  writer.selfClosing(`<UML:TaggedValue${attribute('tag', 'type')}${attribute('value', property.type.name)}/>`)
  writer.selfClosing(`<UML:TaggedValue${attribute('tag', 'lowerBound')}${attribute('value', property.multiplicity.lower)}/>`)
  writer.selfClosing(`<UML:TaggedValue${attribute('tag', 'upperBound')}${attribute('value', property.multiplicity.upper)}/>`)
  writer.close('</UML:ModelElement.taggedValue>')
  writer.close('</UML:Attribute>')
}

function writeOperation(writer: XmlWriter, operation: UMLOperation, primitiveTypes: Map<string, string>): void {
  writer.open(`<UML:Operation${attribute('name', operation.name)}${attribute('xmi.id', operation.id)}${attribute('visibility', operation.visibility)}${attribute('ownerScope', operation.isStatic ? 'classifier' : 'instance')}>`)
  writer.open('<UML:BehavioralFeature.parameter>')
  for (const parameter of operation.parameters) writeParameter(writer, parameter, primitiveTypes)
  if (operation.returnType !== undefined) {
    writer.selfClosing(`<UML:Parameter${attribute('name', 'return')}${attribute('kind', 'return')}${attribute('type', typeId(operation.returnType.name, operation.returnType.classifierId, primitiveTypes))}/>`)
  }
  writer.close('</UML:BehavioralFeature.parameter>')
  writer.close('</UML:Operation>')
}

function writeParameter(writer: XmlWriter, parameter: UMLParameter, primitiveTypes: Map<string, string>): void {
  writer.selfClosing(`<UML:Parameter${attribute('name', parameter.name)}${attribute('kind', parameter.direction)}${attribute('type', typeId(parameter.type.name, parameter.type.classifierId, primitiveTypes))}/>`)
}

function writeAssociation(writer: XmlWriter, association: UMLAssociation): void {
  writer.open(`<UML:Association${attribute('xmi.id', association.id)}${attribute('name', association.name)}${attribute('visibility', 'public')} ${attribute('isRoot', false).trim()}>`)
  writer.open('<UML:Association.connection>')
  association.ends.forEach((end, index) => writeAssociationEnd(writer, end, index === 0 ? 'source' : 'target'))
  writer.close('</UML:Association.connection>')
  writer.close('</UML:Association>')
}

function writeAssociationEnd(writer: XmlWriter, end: UMLAssociationEnd, role: string): void {
  writer.open(`<UML:AssociationEnd${attribute('visibility', 'public')}${attribute('multiplicity', formatMultiplicity(end))}${attribute('aggregation', end.aggregation)}${attribute('isOrdered', end.isOrdered)}${attribute('targetScope', 'instance')}${attribute('changeable', end.isNavigable ? 'changeable' : 'none')}${attribute('isNavigable', end.isNavigable)}${attribute('type', end.type.classifierId ?? end.type.name)}>`)
  writer.open('<UML:ModelElement.taggedValue>')
  writer.selfClosing(`<UML:TaggedValue${attribute('tag', 'ea_end')}${attribute('value', role)}/>`)
  writer.close('</UML:ModelElement.taggedValue>')
  writer.close('</UML:AssociationEnd>')
}

function writeGeneralization(writer: XmlWriter, generalization: UMLGeneralization): void {
  writer.selfClosing(`<UML:Generalization${attribute('xmi.id', generalization.id)}${attribute('child', generalization.specificId)}${attribute('parent', generalization.generalId)}/>`)
}

function writeDependency(writer: XmlWriter, dependency: UMLDependency): void {
  writer.selfClosing(`<UML:Dependency${attribute('xmi.id', dependency.id)}${attribute('client', dependency.clientId)}${attribute('supplier', dependency.supplierId)}/>`)
}

function writeRealization(writer: XmlWriter, realization: UMLRealization): void {
  writer.selfClosing(`<UML:Abstraction${attribute('xmi.id', realization.id)}${attribute('client', realization.clientId)}${attribute('supplier', realization.supplierId)}/>`)
}

function writeDiagram(
  writer: XmlWriter,
  view: UMLDiagramView | undefined,
  diagramId: string,
  packageId: string,
  visualBySemanticId: Map<string, UMLDiagramElement>,
  classifiers: UMLClassifier[],
  warnings: string[],
): void {
  writer.open(`<UML:Diagram${attribute('name', view?.name ?? 'Diagrama de clases')}${attribute('xmi.id', diagramId)}${attribute('diagramType', 'ClassDiagram')}${attribute('owner', packageId)}${attribute('toolName', 'Enterprise Architect 2.5')}>`)
  writer.open('<UML:Diagram.element>')

  let sequence = 1
  for (const classifier of classifiers) {
    const element = visualBySemanticId.get(classifier.id)
    if (element === undefined) {
      warnings.push(`El elemento "${classifier.name}" no tiene posicion visual en la vista.`)
      continue
    }
    writer.selfClosing(`<UML:DiagramElement${attribute('geometry', formatGeometry(element))}${attribute('subject', classifier.id)}${attribute('seqno', sequence)}${attribute('style', `DUID=${element.id};`)}/>`)
    sequence += 1
  }

  for (const link of view?.links ?? []) {
    writer.selfClosing(`<UML:DiagramElement${attribute('geometry', 'SX=0;SY=0;EX=0;EY=0;Path=;')}${attribute('subject', link.semanticElementId)}${attribute('style', `DUID=${link.id};Hidden=0;`)}/>`)
  }

  writer.close('</UML:Diagram.element>')
  writer.close('</UML:Diagram>')
}

function collectPrimitiveTypes(model: UMLModel): Map<string, string> {
  const names = new Set<string>()
  const add = (name: string): void => {
    const normalized = normalizeType(name)
    if (normalized !== undefined) names.add(normalized)
  }

  for (const classifier of model.classifiers) {
    if (classifier.kind === 'enumeration') continue
    for (const property of classifier.attributes ?? []) add(property.type.name)
    for (const operation of classifier.operations) {
      for (const parameter of operation.parameters) add(parameter.type.name)
      if (operation.returnType !== undefined) add(operation.returnType.name)
    }
  }
  for (const association of model.associations) {
    for (const end of association.ends) add(end.type.name)
  }

  return new Map([...names].map((name) => [name, `eaxmiid-${name}`]))
}

function typeId(name: string, classifierId: string | undefined, primitiveTypes: Map<string, string>): string {
  return classifierId ?? primitiveTypes.get(normalizeType(name) ?? '') ?? name
}

function normalizeType(name: string): string | undefined {
  const value = name.trim().toLowerCase()
  if (['string', 'integer', 'int', 'boolean', 'bool', 'float', 'double', 'date', 'void', 'real'].includes(value)) return value
  return undefined
}

function formatMultiplicity(end: UMLAssociationEnd): string {
  return `${end.multiplicity.lower}..${end.multiplicity.upper === '*' ? '*' : end.multiplicity.upper}`
}

function formatGeometry(element: UMLDiagramElement): string {
  const left = element.x * EA_GEOMETRY_SCALE
  const top = element.y * EA_GEOMETRY_SCALE
  const right = (element.x + element.width) * EA_GEOMETRY_SCALE
  const bottom = (element.y + element.height) * EA_GEOMETRY_SCALE
  return `Left=${left};Top=${top};Right=${right};Bottom=${bottom};`
}

function selectView(document: UMLProjectDocument, viewId?: string): UMLDiagramView | undefined {
  if (viewId !== undefined) return document.diagrams.find((diagram) => diagram.id === viewId)
  if (document.activeDiagramId !== undefined) {
    const active = document.diagrams.find((diagram) => diagram.id === document.activeDiagramId)
    if (active !== undefined) return active
  }
  return document.diagrams[0]
}

function packageIdFor(model: UMLModel): string {
  return model.id.startsWith('EAPK_') ? model.id : `EAPK_${model.id}`
}

function diagramIdFor(view: UMLDiagramView | undefined): string {
  const id = view?.id ?? 'diagram'
  return id.startsWith('EAID_') ? id : `EAID_${id}`
}

function attribute(name: string, value: string | number | boolean | undefined): string {
  return value === undefined ? '' : ` ${name}="${escapeXmlAttribute(String(value))}"`
}

class XmlWriter {
  private readonly lines: string[] = []
  private level = 0

  constructor(private readonly pretty: boolean) {}

  raw(line: string): void { this.lines.push(this.indent() + line) }
  open(tag: string): void { this.lines.push(this.indent() + tag); this.level += 1 }
  close(tag: string): void { this.level -= 1; this.lines.push(this.indent() + tag) }
  selfClosing(tag: string): void { this.lines.push(this.indent() + tag) }
  toString(): string { return this.pretty ? this.lines.join('\n') : this.lines.map((line) => line.trim()).join('') }
  private indent(): string { return this.pretty ? '  '.repeat(this.level) : '' }
}
