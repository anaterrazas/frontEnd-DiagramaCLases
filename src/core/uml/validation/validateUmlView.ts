// src/core/uml/validation/validateUmlView.ts
// Validacion pura de referencias de la vista hacia el modelo semantico.

import type { UMLModel, UMLPackage } from '../uml.model'
import type { UMLDiagramView } from '../uml.visual'
import type {
  UMLValidationIssue,
  UMLValidationResult,
} from './validation.types'

export function validateUmlView(view: UMLDiagramView, model: UMLModel): UMLValidationResult {
  const issues: UMLValidationIssue[] = []
  const semanticIds = collectSemanticIds(model)
  const viewIds = new Map<string, string>()
  const diagramElementIds = new Set<string>()

  registerViewId(view.id, 'UMLDiagramView', 'id', viewIds, issues)

  view.elements.forEach((element, index) => {
    const path = `elements[${index}]`
    registerViewId(element.id, 'UMLDiagramElement', `${path}.id`, viewIds, issues)
    diagramElementIds.add(element.id)

    if (!semanticIds.has(element.semanticElementId)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_REFERENCE',
        message: `El elemento visual referencia un elemento semantico inexistente: "${element.semanticElementId}".`,
        elementId: element.id,
        path: `${path}.semanticElementId`,
      })
    }
  })

  view.links?.forEach((link, index) => {
    const path = `links[${index}]`
    registerViewId(link.id, 'UMLDiagramLink', `${path}.id`, viewIds, issues)

    if (!semanticIds.has(link.semanticElementId)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_REFERENCE',
        message: `El enlace visual referencia un elemento semantico inexistente: "${link.semanticElementId}".`,
        elementId: link.id,
        path: `${path}.semanticElementId`,
      })
    }

    if (!diagramElementIds.has(link.sourceElementId)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_REFERENCE',
        message: `El enlace visual referencia un elemento origen inexistente: "${link.sourceElementId}".`,
        elementId: link.id,
        path: `${path}.sourceElementId`,
      })
    }

    if (!diagramElementIds.has(link.targetElementId)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_REFERENCE',
        message: `El enlace visual referencia un elemento destino inexistente: "${link.targetElementId}".`,
        elementId: link.id,
        path: `${path}.targetElementId`,
      })
    }
  })

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
  }
}

function collectSemanticIds(model: UMLModel): Set<string> {
  const ids = new Set<string>([model.id])

  model.stereotypes.forEach((stereotype) => {
    if (stereotype.id !== undefined) ids.add(stereotype.id)
  })

  model.packages.forEach((umlPackage) => collectPackageSemanticIds(umlPackage, ids))

  model.classifiers.forEach((classifier) => {
    ids.add(classifier.id)

    classifier.stereotypes?.forEach((stereotype) => {
      if (stereotype.id !== undefined) ids.add(stereotype.id)
    })

    if (classifier.kind === 'enumeration') {
      classifier.literals.forEach((literal) => ids.add(literal.id))
      return
    }

    classifier.attributes?.forEach((attribute) => {
      ids.add(attribute.id)
      attribute.stereotypes?.forEach((stereotype) => {
        if (stereotype.id !== undefined) ids.add(stereotype.id)
      })
    })

    classifier.operations.forEach((operation) => {
      ids.add(operation.id)
      operation.stereotypes?.forEach((stereotype) => {
        if (stereotype.id !== undefined) ids.add(stereotype.id)
      })
      operation.parameters.forEach((parameter) => ids.add(parameter.id))
    })
  })

  model.associations.forEach((association) => {
    ids.add(association.id)
    association.stereotypes?.forEach((stereotype) => {
      if (stereotype.id !== undefined) ids.add(stereotype.id)
    })
    association.ends.forEach((end) => ids.add(end.id))
  })

  model.generalizations.forEach((generalization) => ids.add(generalization.id))
  model.dependencies.forEach((dependency) => ids.add(dependency.id))
  model.realizations.forEach((realization) => ids.add(realization.id))
  model.associationClasses.forEach((associationClass) => ids.add(associationClass.id))

  return ids
}

function collectPackageSemanticIds(umlPackage: UMLPackage, ids: Set<string>): void {
  ids.add(umlPackage.id)

  umlPackage.stereotypes?.forEach((stereotype) => {
    if (stereotype.id !== undefined) ids.add(stereotype.id)
  })

  umlPackage.packages?.forEach((childPackage) => collectPackageSemanticIds(childPackage, ids))
}

function registerViewId(
  id: string,
  label: string,
  path: string,
  registry: Map<string, string>,
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

  const previousPath = registry.get(id)
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

  registry.set(id, path)
}
