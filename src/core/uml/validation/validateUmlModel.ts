// src/core/uml/validation/validateUmlModel.ts
// Validacion pura del modelo semantico UML. No muta el modelo recibido.

import type {
  UMLClassifier,
  UMLModel,
  UMLPackage,
} from '../uml.model'
import type {
  UMLMultiplicity,
  UMLTypeReference,
} from '../uml.types'
import type {
  UMLValidationIssue,
  UMLValidationResult,
} from './validation.types'

const INVALID_GENERALIZATION_CODE = 'INVALID_GENERALIZATION' as UMLValidationIssue['code']
const INVALID_ASSOCIATION_CODE = 'INVALID_ASSOCIATION' as UMLValidationIssue['code']

interface IdRegistry {
  allIds: Map<string, string>
  classifierIds: Set<string>
  classIds: Set<string>
  associationIds: Set<string>
  associationClassIds: Set<string>
}

export function validateUmlModel(model: UMLModel): UMLValidationResult {
  const issues: UMLValidationIssue[] = []
  const registry: IdRegistry = {
    allIds: new Map<string, string>(),
    classifierIds: new Set<string>(),
    classIds: new Set<string>(),
    associationIds: new Set<string>(),
    associationClassIds: new Set<string>(),
  }

  collectIds(model, registry, issues)
  validateReferences(model, registry, issues)
  validateGeneralizations(model, registry, issues)
  validateAssociations(model, issues)
  validateMultiplicities(model, issues)

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
  }
}

function collectIds(model: UMLModel, registry: IdRegistry, issues: UMLValidationIssue[]): void {
  registerId(model.id, 'UMLModel', 'id', registry, issues)

  model.stereotypes.forEach((stereotype, index) => {
    if (stereotype.id !== undefined) {
      registerId(stereotype.id, 'UMLStereotype', `stereotypes[${index}].id`, registry, issues)
    }
  })

  model.packages.forEach((umlPackage, index) => {
    collectPackageIds(umlPackage, `packages[${index}]`, registry, issues)
  })

  model.classifiers.forEach((classifier, classifierIndex) => {
    const classifierPath = `classifiers[${classifierIndex}]`
    registerId(classifier.id, `UMLClassifier(${classifier.kind})`, `${classifierPath}.id`, registry, issues)
    registry.classifierIds.add(classifier.id)

    if (classifier.kind === 'class') {
      registry.classIds.add(classifier.id)
    }

    collectClassifierMemberIds(classifier, classifierPath, registry, issues)
  })

  model.associations.forEach((association, associationIndex) => {
    const associationPath = `associations[${associationIndex}]`
    registerId(association.id, 'UMLAssociation', `${associationPath}.id`, registry, issues)
    registry.associationIds.add(association.id)

    association.stereotypes?.forEach((stereotype, stereotypeIndex) => {
      if (stereotype.id !== undefined) {
        registerId(stereotype.id, 'UMLStereotype', `${associationPath}.stereotypes[${stereotypeIndex}].id`, registry, issues)
      }
    })

    association.ends.forEach((end, endIndex) => {
      registerId(end.id, 'UMLAssociationEnd', `${associationPath}.ends[${endIndex}].id`, registry, issues)
    })
  })

  model.generalizations.forEach((generalization, index) => {
    registerId(generalization.id, 'UMLGeneralization', `generalizations[${index}].id`, registry, issues)
  })

  model.dependencies.forEach((dependency, index) => {
    registerId(dependency.id, 'UMLDependency', `dependencies[${index}].id`, registry, issues)
  })

  model.realizations.forEach((realization, index) => {
    registerId(realization.id, 'UMLRealization', `realizations[${index}].id`, registry, issues)
  })

  model.associationClasses.forEach((associationClass, index) => {
    registerId(associationClass.id, 'UMLAssociationClass', `associationClasses[${index}].id`, registry, issues)
    registry.associationClassIds.add(associationClass.id)
  })
}

function collectPackageIds(umlPackage: UMLPackage, path: string, registry: IdRegistry, issues: UMLValidationIssue[]): void {
  registerId(umlPackage.id, 'UMLPackage', `${path}.id`, registry, issues)

  umlPackage.stereotypes?.forEach((stereotype, index) => {
    if (stereotype.id !== undefined) {
      registerId(stereotype.id, 'UMLStereotype', `${path}.stereotypes[${index}].id`, registry, issues)
    }
  })

  umlPackage.packages?.forEach((childPackage, index) => {
    collectPackageIds(childPackage, `${path}.packages[${index}]`, registry, issues)
  })
}

function collectClassifierMemberIds(
  classifier: UMLClassifier,
  classifierPath: string,
  registry: IdRegistry,
  issues: UMLValidationIssue[],
): void {
  classifier.stereotypes?.forEach((stereotype, stereotypeIndex) => {
    if (stereotype.id !== undefined) {
      registerId(stereotype.id, 'UMLStereotype', `${classifierPath}.stereotypes[${stereotypeIndex}].id`, registry, issues)
    }
  })

  if (classifier.kind === 'enumeration') {
    classifier.literals.forEach((literal, literalIndex) => {
      registerId(literal.id, 'UMLEnumerationLiteral', `${classifierPath}.literals[${literalIndex}].id`, registry, issues)
    })
    return
  }

  classifier.attributes?.forEach((attribute, attributeIndex) => {
    const attributePath = `${classifierPath}.attributes[${attributeIndex}]`
    registerId(attribute.id, 'UMLProperty', `${attributePath}.id`, registry, issues)

    attribute.stereotypes?.forEach((stereotype, stereotypeIndex) => {
      if (stereotype.id !== undefined) {
        registerId(stereotype.id, 'UMLStereotype', `${attributePath}.stereotypes[${stereotypeIndex}].id`, registry, issues)
      }
    })
  })

  classifier.operations.forEach((operation, operationIndex) => {
    const operationPath = `${classifierPath}.operations[${operationIndex}]`
    registerId(operation.id, 'UMLOperation', `${operationPath}.id`, registry, issues)

    operation.stereotypes?.forEach((stereotype, stereotypeIndex) => {
      if (stereotype.id !== undefined) {
        registerId(stereotype.id, 'UMLStereotype', `${operationPath}.stereotypes[${stereotypeIndex}].id`, registry, issues)
      }
    })

    operation.parameters.forEach((parameter, parameterIndex) => {
      registerId(parameter.id, 'UMLParameter', `${operationPath}.parameters[${parameterIndex}].id`, registry, issues)
    })
  })
}

function registerId(
  id: string,
  label: string,
  path: string,
  registry: IdRegistry,
  issues: UMLValidationIssue[],
): void {
  if (id.trim() === '') {
    issues.push({
      severity: 'error',
      code: 'EMPTY_ID',
      message: `${label} tiene un id vacio.`,
      path,
    })
    return
  }

  const previousPath = registry.allIds.get(id)
  if (previousPath !== undefined) {
    issues.push({
      severity: 'error',
      code: 'DUPLICATE_ID',
      message: `${label} usa el id duplicado "${id}". Ya existe en ${previousPath}.`,
      elementId: id,
      path,
    })
    return
  }

  registry.allIds.set(id, path)
}

function validateReferences(model: UMLModel, registry: IdRegistry, issues: UMLValidationIssue[]): void {
  model.packages.forEach((umlPackage, index) => {
    validatePackageReferences(umlPackage, `packages[${index}]`, registry, issues)
  })

  model.classifiers.forEach((classifier, classifierIndex) => {
    const classifierPath = `classifiers[${classifierIndex}]`

    if (classifier.kind !== 'enumeration') {
      classifier.attributes?.forEach((attribute, attributeIndex) => {
        validateTypeReference(attribute.type, `${classifierPath}.attributes[${attributeIndex}].type`, registry, issues, attribute.id)
      })

      classifier.operations.forEach((operation, operationIndex) => {
        const operationPath = `${classifierPath}.operations[${operationIndex}]`

        operation.parameters.forEach((parameter, parameterIndex) => {
          validateTypeReference(parameter.type, `${operationPath}.parameters[${parameterIndex}].type`, registry, issues, parameter.id)
        })

        if (operation.returnType !== undefined) {
          validateTypeReference(operation.returnType, `${operationPath}.returnType`, registry, issues, operation.id)
        }
      })
    }
  })

  model.associations.forEach((association, associationIndex) => {
    const associationPath = `associations[${associationIndex}]`

    association.ends.forEach((end, endIndex) => {
      validateTypeReference(end.type, `${associationPath}.ends[${endIndex}].type`, registry, issues, end.id)
    })

    if (association.associationClassId !== undefined) {
      validateIdReference(
        association.associationClassId,
        registry.associationClassIds,
        `${associationPath}.associationClassId`,
        issues,
        association.id,
        'La associationClassId de la asociacion no existe.',
      )
    }
  })

  model.generalizations.forEach((generalization, index) => {
    const path = `generalizations[${index}]`
    validateIdReference(generalization.specificId, registry.classifierIds, `${path}.specificId`, issues, generalization.id, 'El specificId de la generalizacion no existe.')
    validateIdReference(generalization.generalId, registry.classifierIds, `${path}.generalId`, issues, generalization.id, 'El generalId de la generalizacion no existe.')
  })

  model.dependencies.forEach((dependency, index) => {
    const path = `dependencies[${index}]`
    validateIdReference(dependency.clientId, registry.classifierIds, `${path}.clientId`, issues, dependency.id, 'El clientId de la dependencia no existe.')
    validateIdReference(dependency.supplierId, registry.classifierIds, `${path}.supplierId`, issues, dependency.id, 'El supplierId de la dependencia no existe.')
  })

  model.realizations.forEach((realization, index) => {
    const path = `realizations[${index}]`
    validateIdReference(realization.clientId, registry.classifierIds, `${path}.clientId`, issues, realization.id, 'El clientId de la realizacion no existe.')
    validateIdReference(realization.supplierId, registry.classifierIds, `${path}.supplierId`, issues, realization.id, 'El supplierId de la realizacion no existe.')
  })

  model.associationClasses.forEach((associationClass, index) => {
    const path = `associationClasses[${index}]`
    validateIdReference(associationClass.classId, registry.classIds, `${path}.classId`, issues, associationClass.id, 'El classId de la clase de asociacion no existe o no referencia una clase.')
    validateIdReference(associationClass.associationId, registry.associationIds, `${path}.associationId`, issues, associationClass.id, 'El associationId de la clase de asociacion no existe.')
  })
}

function validatePackageReferences(umlPackage: UMLPackage, path: string, registry: IdRegistry, issues: UMLValidationIssue[]): void {
  umlPackage.classifierIds.forEach((classifierId, index) => {
    validateIdReference(classifierId, registry.classifierIds, `${path}.classifierIds[${index}]`, issues, umlPackage.id, 'El classifierId del paquete no existe.')
  })

  umlPackage.packages?.forEach((childPackage, index) => {
    validatePackageReferences(childPackage, `${path}.packages[${index}]`, registry, issues)
  })
}

function validateGeneralizations(model: UMLModel, registry: IdRegistry, issues: UMLValidationIssue[]): void {
  const graph = new Map<string, string[]>()

  model.generalizations.forEach((generalization, index) => {
    const path = `generalizations[${index}]`

    if (generalization.specificId === generalization.generalId) {
      issues.push({
        severity: 'error',
        code: INVALID_GENERALIZATION_CODE,
        message: 'Una generalizacion no puede tener el mismo classifier como specificId y generalId.',
        elementId: generalization.id,
        path,
      })
      return
    }

    if (!registry.classifierIds.has(generalization.specificId) || !registry.classifierIds.has(generalization.generalId)) {
      return
    }

    const generals = graph.get(generalization.specificId) ?? []
    generals.push(generalization.generalId)
    graph.set(generalization.specificId, generals)
  })

  const visited = new Set<string>()
  const visiting = new Set<string>()
  const stack: string[] = []

  for (const classifierId of graph.keys()) {
    if (findGeneralizationCycle(classifierId, graph, visited, visiting, stack)) {
      issues.push({
        severity: 'error',
        code: INVALID_GENERALIZATION_CODE,
        message: `Las generalizaciones contienen un ciclo: ${formatCycle(stack)}.`,
        path: 'generalizations',
      })
      return
    }
  }
}

function findGeneralizationCycle(
  classifierId: string,
  graph: Map<string, string[]>,
  visited: Set<string>,
  visiting: Set<string>,
  stack: string[],
): boolean {
  if (visiting.has(classifierId)) {
    stack.push(classifierId)
    return true
  }

  if (visited.has(classifierId)) {
    return false
  }

  visiting.add(classifierId)
  stack.push(classifierId)

  for (const generalId of graph.get(classifierId) ?? []) {
    if (findGeneralizationCycle(generalId, graph, visited, visiting, stack)) {
      return true
    }
  }

  visiting.delete(classifierId)
  visited.add(classifierId)
  stack.pop()

  return false
}

function formatCycle(stack: string[]): string {
  const repeatedId = stack[stack.length - 1]
  const cycleStartIndex = stack.indexOf(repeatedId)

  if (cycleStartIndex < 0) {
    return stack.join(' -> ')
  }

  return stack.slice(cycleStartIndex).join(' -> ')
}

function validateAssociations(model: UMLModel, issues: UMLValidationIssue[]): void {
  model.associations.forEach((association, index) => {
    if (association.ends.length < 2) {
      issues.push({
        severity: 'error',
        code: INVALID_ASSOCIATION_CODE,
        message: 'Una asociacion UML debe tener al menos dos extremos.',
        elementId: association.id,
        path: `associations[${index}].ends`,
      })
    }
  })
}

function validateTypeReference(
  typeReference: UMLTypeReference,
  path: string,
  registry: IdRegistry,
  issues: UMLValidationIssue[],
  elementId?: string,
): void {
  if (typeReference.kind !== 'classifier') {
    return
  }

  if (typeReference.classifierId === undefined || typeReference.classifierId.trim() === '') {
    issues.push({
      severity: 'error',
      code: 'MISSING_REFERENCE',
      message: 'La referencia de tipo classifier no declara classifierId.',
      elementId,
      path: `${path}.classifierId`,
    })
    return
  }

  validateIdReference(
    typeReference.classifierId,
    registry.classifierIds,
    `${path}.classifierId`,
    issues,
    elementId,
    'La referencia de tipo classifier apunta a un classifier inexistente.',
  )
}

function validateIdReference(
  id: string,
  allowedIds: Set<string>,
  path: string,
  issues: UMLValidationIssue[],
  elementId: string | undefined,
  message: string,
): void {
  if (!allowedIds.has(id)) {
    issues.push({
      severity: 'error',
      code: 'MISSING_REFERENCE',
      message: `${message} Referencia: "${id}".`,
      elementId,
      path,
    })
  }
}

function validateMultiplicities(model: UMLModel, issues: UMLValidationIssue[]): void {
  model.classifiers.forEach((classifier, classifierIndex) => {
    if (classifier.kind === 'enumeration') {
      return
    }

    const classifierPath = `classifiers[${classifierIndex}]`

    classifier.attributes?.forEach((attribute, attributeIndex) => {
      validateMultiplicity(attribute.multiplicity, `${classifierPath}.attributes[${attributeIndex}].multiplicity`, issues, attribute.id)
    })

    classifier.operations.forEach((operation, operationIndex) => {
      operation.parameters.forEach((parameter, parameterIndex) => {
        validateMultiplicity(
          parameter.multiplicity,
          `${classifierPath}.operations[${operationIndex}].parameters[${parameterIndex}].multiplicity`,
          issues,
          parameter.id,
        )
      })
    })
  })

  model.associations.forEach((association, associationIndex) => {
    association.ends.forEach((end, endIndex) => {
      validateMultiplicity(end.multiplicity, `associations[${associationIndex}].ends[${endIndex}].multiplicity`, issues, end.id)
    })
  })
}

function validateMultiplicity(
  multiplicity: UMLMultiplicity,
  path: string,
  issues: UMLValidationIssue[],
  elementId?: string,
): void {
  if (!Number.isInteger(multiplicity.lower)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_MULTIPLICITY',
      message: 'El limite inferior de la multiplicidad debe ser un entero.',
      elementId,
      path: `${path}.lower`,
    })
  }

  if (multiplicity.lower < 0) {
    issues.push({
      severity: 'error',
      code: 'INVALID_MULTIPLICITY',
      message: 'El limite inferior de la multiplicidad no puede ser negativo.',
      elementId,
      path: `${path}.lower`,
    })
  }

  if (multiplicity.upper === '*') {
    return
  }

  if (!Number.isInteger(multiplicity.upper)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_MULTIPLICITY',
      message: 'El limite superior de la multiplicidad debe ser un entero o "*".',
      elementId,
      path: `${path}.upper`,
    })
  }

  if (multiplicity.upper < 0) {
    issues.push({
      severity: 'error',
      code: 'INVALID_MULTIPLICITY',
      message: 'El limite superior de la multiplicidad no puede ser negativo.',
      elementId,
      path: `${path}.upper`,
    })
  }

  if (multiplicity.lower > multiplicity.upper) {
    issues.push({
      severity: 'error',
      code: 'INVALID_MULTIPLICITY',
      message: 'El limite inferior de la multiplicidad no puede ser mayor que el superior.',
      elementId,
      path,
    })
  }
}
