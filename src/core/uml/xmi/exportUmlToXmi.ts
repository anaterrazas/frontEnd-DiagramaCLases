// src/core/uml/xmi/exportUmlToXmi.ts
// Exportador XMI 2.5.1 para el subconjunto UML semantico del proyecto.

import type {
  UMLAssociation,
  UMLAssociationEnd,
  UMLClassifier,
  UMLDependency,
  UMLGeneralization,
  UMLModel,
  UMLOperation,
  UMLParameter,
  UMLProperty,
  UMLRealization,
} from '../uml.model'
import type { UMLMultiplicity, UMLTypeReference } from '../uml.types'
import { validateUmlModel } from '../validation'
import type { XmiExportOptions, XmiExportResult } from './xmi.types'
import { escapeXmlAttribute, xmlAttribute } from './xmi.escape'

const XMI_VERSION = '2.5.1'
const XMI_NAMESPACE = 'http://www.omg.org/spec/XMI/20131001'
const UML_NAMESPACE = 'http://www.eclipse.org/uml2/5.0.0/UML'

export function exportUmlModelToXmi(
  model: UMLModel,
  options: XmiExportOptions = {},
): XmiExportResult {
  const validation = validateUmlModel(model)
  const warnings: string[] = []

  if (!validation.valid) {
    warnings.push('El modelo UML contiene errores de validacion; se exporta igualmente para diagnostico.')
  }

  if (model.associationClasses.length > 0) {
    warnings.push('UMLAssociationClass no se exporta como uml:AssociationClass completa en esta fase.')
  }

  if (model.stereotypes.length > 0 || model.classifiers.some((classifier) => classifier.stereotypes?.length)) {
    warnings.push('Los estereotipos UML no se exportan como perfiles UML en esta fase.')
  }

  const writer = new XmlWriter(options.pretty !== false)
  const generalizationsBySpecificId = groupGeneralizationsBySpecificId(model.generalizations)

  writer.raw('<?xml version="1.0" encoding="UTF-8"?>')
  writer.open(`xmi:XMI${xmlAttribute('xmi:version', XMI_VERSION)}${xmlAttribute('xmlns:xmi', XMI_NAMESPACE)}${xmlAttribute('xmlns:uml', UML_NAMESPACE)}`)
  writer.open(`uml:Model${xmlAttribute('xmi:id', model.id)}${xmlAttribute('name', model.name)}`)

  for (const classifier of model.classifiers) {
    writeClassifier(writer, classifier, generalizationsBySpecificId.get(classifier.id) ?? [])
  }

  for (const association of model.associations) {
    writeAssociation(writer, association)
  }

  for (const dependency of model.dependencies) {
    writeDependency(writer, dependency)
  }

  for (const realization of model.realizations) {
    writeRealization(writer, realization)
  }

  writer.close('uml:Model')
  writer.close('xmi:XMI')

  return {
    xmi: writer.toString(),
    warnings,
    validation,
  }
}

function writeClassifier(writer: XmlWriter, classifier: UMLClassifier, generalizations: UMLGeneralization[]): void {
  switch (classifier.kind) {
    case 'class': {
      writer.open(`packagedElement${xmlAttribute('xmi:type', 'uml:Class')}${xmlAttribute('xmi:id', classifier.id)}${xmlAttribute('name', classifier.name)}${xmlAttribute('visibility', classifier.visibility)}${xmlAttribute('isAbstract', classifier.isAbstract)}`)

      for (const generalization of generalizations) {
        writeGeneralization(writer, generalization)
      }

      for (const attribute of classifier.attributes) {
        writeProperty(writer, 'ownedAttribute', attribute)
      }

      for (const operation of classifier.operations) {
        writeOperation(writer, operation)
      }

      writer.close('packagedElement')
      break
    }

    case 'interface': {
      writer.open(`packagedElement${xmlAttribute('xmi:type', 'uml:Interface')}${xmlAttribute('xmi:id', classifier.id)}${xmlAttribute('name', classifier.name)}${xmlAttribute('visibility', classifier.visibility)}`)

      for (const generalization of generalizations) {
        writeGeneralization(writer, generalization)
      }

      for (const attribute of classifier.attributes ?? []) {
        writeProperty(writer, 'ownedAttribute', attribute)
      }
      for (const operation of classifier.operations) {
        writeOperation(writer, operation)
      }
      writer.close('packagedElement')
      break
    }

    case 'enumeration': {
      writer.open(`packagedElement${xmlAttribute('xmi:type', 'uml:Enumeration')}${xmlAttribute('xmi:id', classifier.id)}${xmlAttribute('name', classifier.name)}${xmlAttribute('visibility', classifier.visibility)}`)

      for (const literal of classifier.literals) {
        writer.selfClosing(`ownedLiteral${xmlAttribute('xmi:id', literal.id)}${xmlAttribute('name', literal.name)}`)
      }

      writer.close('packagedElement')
      break
    }
  }
}

function writeProperty(writer: XmlWriter, tagName: string, property: UMLProperty): void {
  writer.open(`${tagName}${xmlAttribute('xmi:id', property.id)}${xmlAttribute('name', property.name)}${xmlAttribute('visibility', property.visibility)}${xmlAttribute('type', formatTypeReference(property.type))}${xmlAttribute('isOrdered', property.isOrdered)}${xmlAttribute('isUnique', property.isUnique)}${xmlAttribute('isReadOnly', property.isReadOnly)}${xmlAttribute('isStatic', property.isStatic)}${xmlAttribute('isDerived', property.isDerived)}${xmlAttribute('aggregation', property.aggregation)}`)
  writeMultiplicity(writer, property.id, property.multiplicity)

  if (property.defaultValue !== undefined) {
    writer.selfClosing(`defaultValue${xmlAttribute('xmi:type', 'uml:LiteralString')}${xmlAttribute('xmi:id', `${property.id}-default`)}${xmlAttribute('value', property.defaultValue)}`)
  }

  writer.close(tagName)
}

function writeOperation(writer: XmlWriter, operation: UMLOperation): void {
  writer.open(`ownedOperation${xmlAttribute('xmi:id', operation.id)}${xmlAttribute('name', operation.name)}${xmlAttribute('visibility', operation.visibility)}${xmlAttribute('isAbstract', operation.isAbstract)}${xmlAttribute('isStatic', operation.isStatic)}${xmlAttribute('isQuery', operation.isQuery)}`)

  for (const parameter of operation.parameters) {
    writeParameter(writer, parameter)
  }

  if (operation.returnType !== undefined) {
    writer.open(`ownedParameter${xmlAttribute('xmi:id', `${operation.id}-return`)}${xmlAttribute('direction', 'return')}${xmlAttribute('type', formatTypeReference(operation.returnType))}`)
    writeMultiplicity(writer, `${operation.id}-return`, { lower: 1, upper: 1 })
    writer.close('ownedParameter')
  }

  writer.close('ownedOperation')
}

function writeParameter(writer: XmlWriter, parameter: UMLParameter): void {
  writer.open(`ownedParameter${xmlAttribute('xmi:id', parameter.id)}${xmlAttribute('name', parameter.name)}${xmlAttribute('direction', parameter.direction)}${xmlAttribute('type', formatTypeReference(parameter.type))}`)
  writeMultiplicity(writer, parameter.id, parameter.multiplicity)

  if (parameter.defaultValue !== undefined) {
    writer.selfClosing(`defaultValue${xmlAttribute('xmi:type', 'uml:LiteralString')}${xmlAttribute('xmi:id', `${parameter.id}-default`)}${xmlAttribute('value', parameter.defaultValue)}`)
  }

  writer.close('ownedParameter')
}

function writeGeneralization(writer: XmlWriter, generalization: UMLGeneralization): void {
  writer.selfClosing(`generalization${xmlAttribute('xmi:id', generalization.id)}${xmlAttribute('general', generalization.generalId)}`)
}

function writeAssociation(writer: XmlWriter, association: UMLAssociation): void {
  writer.open(`packagedElement${xmlAttribute('xmi:type', 'uml:Association')}${xmlAttribute('xmi:id', association.id)}${xmlAttribute('name', association.name)}${xmlAttribute('isDerived', association.isDerived)}${xmlAttribute('memberEnd', association.ends.map((end) => end.id).join(' '))}${xmlAttribute('navigableOwnedEnd', association.ends.filter((end) => end.isNavigable).map((end) => end.id).join(' ') || undefined)}`)

  for (const end of association.ends) {
    writeAssociationEnd(writer, end)
  }

  writer.close('packagedElement')
}

function writeAssociationEnd(writer: XmlWriter, end: UMLAssociationEnd): void {
  writer.open(`ownedEnd${xmlAttribute('xmi:id', end.id)}${xmlAttribute('name', end.role)}${xmlAttribute('type', formatTypeReference(end.type))}${xmlAttribute('isOrdered', end.isOrdered)}${xmlAttribute('isUnique', end.isUnique)}${xmlAttribute('aggregation', end.aggregation)}`)
  writeMultiplicity(writer, end.id, end.multiplicity)
  writer.close('ownedEnd')
}

function writeDependency(writer: XmlWriter, dependency: UMLDependency): void {
  writer.selfClosing(`packagedElement${xmlAttribute('xmi:type', 'uml:Dependency')}${xmlAttribute('xmi:id', dependency.id)}${xmlAttribute('client', dependency.clientId)}${xmlAttribute('supplier', dependency.supplierId)}`)
}

function writeRealization(writer: XmlWriter, realization: UMLRealization): void {
  writer.selfClosing(`packagedElement${xmlAttribute('xmi:type', 'uml:Realization')}${xmlAttribute('xmi:id', realization.id)}${xmlAttribute('client', realization.clientId)}${xmlAttribute('supplier', realization.supplierId)}`)
}

function writeMultiplicity(writer: XmlWriter, ownerId: string, multiplicity: UMLMultiplicity): void {
  writer.selfClosing(`lowerValue${xmlAttribute('xmi:type', 'uml:LiteralInteger')}${xmlAttribute('xmi:id', `${ownerId}-lower`)}${xmlAttribute('value', multiplicity.lower)}`)
  writer.selfClosing(`upperValue${xmlAttribute('xmi:type', 'uml:LiteralUnlimitedNatural')}${xmlAttribute('xmi:id', `${ownerId}-upper`)}${xmlAttribute('value', multiplicity.upper)}`)
}

function formatTypeReference(type: UMLTypeReference): string {
  if (type.kind === 'classifier' && type.classifierId !== undefined) {
    return type.classifierId
  }

  return type.name
}

function groupGeneralizationsBySpecificId(generalizations: UMLGeneralization[]): Map<string, UMLGeneralization[]> {
  const result = new Map<string, UMLGeneralization[]>()

  for (const generalization of generalizations) {
    const items = result.get(generalization.specificId) ?? []
    items.push(generalization)
    result.set(generalization.specificId, items)
  }

  return result
}

class XmlWriter {
  private readonly lines: string[] = []
  private level = 0

  constructor(private readonly pretty: boolean) {}

  raw(line: string): void {
    this.lines.push(this.indent() + line)
  }

  open(tag: string): void {
    this.lines.push(`${this.indent()}<${tag}>`)
    this.level++
  }

  close(tagName: string): void {
    this.level--
    this.lines.push(`${this.indent()}</${tagName}>`)
  }

  selfClosing(tag: string): void {
    this.lines.push(`${this.indent()}<${tag}/>`)
  }

  toString(): string {
    if (this.pretty) {
      return this.lines.join('\n')
    }

    return this.lines.map((line) => line.trim()).join('')
  }

  private indent(): string {
    return this.pretty ? '  '.repeat(this.level) : ''
  }
}
