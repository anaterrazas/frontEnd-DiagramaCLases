// src/modules/editor/adapters/canvasToUml.ts
//
// Adapter Canvas → UMLModel (y vista UMLDiagramView).
//
// Función PURA: recibe un snapshot del modelo del Canvas (DiagramModel con
// atributos/métodos en texto plano) y produce el modelo semántico UML 2.5.1.
// No toca el engine, Pinia, SQLite, IA ni red.

import {
  UML_APP_FORMAT_VERSION,
  UML_VERSION,
} from '@/core/uml'
import type {
  UMLAssociation,
  UMLAssociationClass,
  UMLAssociationEnd,
  UMLClass,
  UMLDiagramLink,
  UMLDiagramView,
  UMLModel,
  UMLTypeReference,
} from '@/core/uml'
import type {
  DiagramModel,
  LinkEdge,
} from '@/modules/editor/services/canvas.engine'
import { parseCanvasAttribute, parseCanvasMethod, parseMultiplicityText } from './uml.parsers'
import type { AdapterWarning, CanvasToUmlResult } from './types'

const DEFAULT_MODEL_ID = 'uml-model'
const DEFAULT_VIEW_ID = 'uml-view'

function viewElementId(classifierId: string): string {
  return `ve-${classifierId}`
}

function viewLinkId(semanticId: string): string {
  return `vl-${semanticId}`
}

/** Genera un UUID v4 (o fallback) para nuevos elementos semánticos. */
function newSemanticId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Convierte el estado del Canvas (DiagramModel) en UMLModel + UMLDiagramView.
 *
 * `modelId`/`viewId`: ids estables (deterministas) del modelo raíz y vista.
 */
export function canvasToUml(
  snapshot: DiagramModel,
  opts: { modelId?: string; viewId?: string } = {},
): CanvasToUmlResult {
  const warnings: AdapterWarning[] = []
  const modelId = opts.modelId ?? DEFAULT_MODEL_ID
  const viewId = opts.viewId ?? DEFAULT_VIEW_ID

  const classes: UMLClass[] = []
  const viewElements: UMLDiagramView['elements'] = []

  // Índice nombre-de-clase → id (resuelve UMLTypeReference kind 'classifier')
  const classifiersByName = new Map<string, string>()
  for (const c of Object.values(snapshot.classes ?? {})) {
    if (classifiersByName.has(c.name)) {
      warnings.push({
        code: 'duplicate-class-name',
        message: `Existe más de una clase llamada "${c.name}"; las referencias por nombre resuelven al primer id.`,
        targetId: c.id,
      })
    } else {
      classifiersByName.set(c.name, c.id)
    }
  }

  /* ---------------- Clases ---------------- */
  for (const c of Object.values(snapshot.classes ?? {})) {
    const attributes = (c.attributes ?? []).map((line, i) => {
      const parsed = parseCanvasAttribute(line, classifiersByName)
      for (const w of parsed.warnings) {
        warnings.push({ code: 'parse-attribute', message: w, targetId: c.id })
      }
      return { ...parsed.property, id: newSemanticId() }
    })

    const operations = (c.methods ?? []).map((line, i) => {
      const parsed = parseCanvasMethod(line)
      for (const w of parsed.warnings) {
        warnings.push({ code: 'parse-method', message: w, targetId: c.id })
      }
      return { ...parsed.operation, id: newSemanticId() }
    })

    classes.push({
      kind: 'class',
      id: c.id,
      name: c.name,
      // El Canvas no modela visibilidad de clase → default UML (public).
      visibility: 'public',
      isAbstract: false,
      attributes,
      operations,
    })

    viewElements.push({
      id: viewElementId(c.id),
      semanticElementId: c.id,
      x: Math.round(c.x ?? 0),
      y: Math.round(c.y ?? 0),
      width: Math.round(c.w ?? 170),
      height: Math.round(c.h ?? 70),
    })
  }

  /* ---------------- Relaciones ---------------- */
  const associations: UMLAssociation[] = []
  const generalizations: UMLModel['generalizations'] = []
  const dependencies: UMLModel['dependencies'] = []
  const associationClasses: UMLAssociationClass[] = []
  const viewLinks: UMLDiagramLink[] = []

  const classIdToName = new Map<string, string>()
  for (const c of Object.values(snapshot.classes ?? {})) classIdToName.set(c.id, c.name)

  for (const l of Object.values(snapshot.links ?? {})) {
    const srcName = classIdToName.get(l.sourceId) ?? ''
    const tgtName = classIdToName.get(l.targetId) ?? ''

    switch (l.kind) {
      case 'Associate':
      case 'Aggregate':
      case 'Compose': {
        // Rombo (shared/composite) en el extremo SOURCE (convención del motor,
        // ver drawDiamondAtSource) = parte "todo" de la relación.
        const srcAgg: UMLAssociationEnd['aggregation'] =
          l.kind === 'Compose' ? 'composite' : l.kind === 'Aggregate' ? 'shared' : 'none'

        const srcEnd = makeEnd(l, 'src', srcAgg, l.labels?.src, srcName, tgtName, classifiersByName, warnings)
        const tgtEnd = makeEnd(l, 'tgt', 'none', l.labels?.tgt, srcName, tgtName, classifiersByName, warnings)

        const association: UMLAssociation = {
          id: l.id,
          name: l.labels?.name || undefined,
          ends: [srcEnd, tgtEnd],
          associationClassId: l.assocClassId ? `acl-${l.id}` : undefined,
        }
        associations.push(association)
        viewLinks.push(makeViewLink(l))

        if (l.assocClassId) {
          associationClasses.push({
            id: `acl-${l.id}`,
            classId: l.assocClassId,
            associationId: l.id,
          })
        }
        break
      }

      case 'Generalize': {
        // sourceId = subclase (specific), targetId = superclase (general).
        generalizations.push({
          id: l.id,
          specificId: l.sourceId,
          generalId: l.targetId,
        })
        viewLinks.push(makeViewLink(l))
        break
      }

      case 'Dependency': {
        dependencies.push({
          id: l.id,
          clientId: l.sourceId,
          supplierId: l.targetId,
        })
        viewLinks.push(makeViewLink(l))
        break
      }
    }
  }

  const model: UMLModel = {
    id: modelId,
    name: 'Diagrama de clases',
    umlVersion: UML_VERSION,
    formatVersion: UML_APP_FORMAT_VERSION,
    packages: [],
    classifiers: classes,
    associations,
    generalizations,
    dependencies,
    realizations: [],
    associationClasses,
    stereotypes: [],
  }

  const view: UMLDiagramView = {
    id: viewId,
    name: 'Vista principal',
    elements: viewElements,
    links: viewLinks,
  }

  return { model, view, warnings }
}

/**
 * Construye un UMLAssociationEnd desde un extremo de link.
 * La label se interpreta como multiplicidad; si no lo es, se conserva como rol.
 */
function makeEnd(
  link: LinkEdge,
  which: 'src' | 'tgt',
  aggregation: UMLAssociationEnd['aggregation'],
  label: string | undefined,
  srcName: string,
  tgtName: string,
  classifiersByName: Map<string, string>,
  warnings: AdapterWarning[],
): UMLAssociationEnd {
  const isSrc = which === 'src'
  const nodeName = isSrc ? srcName : tgtName
  const classifierId = classifiersByName.get(nodeName)

  const parsed = parseMultiplicityText(label)
  let multiplicity = { lower: 1, upper: 1 }
  let role: string | undefined

  if (parsed.error) {
    // La label no es una multiplicidad: se conserva como rol (el Canvas no
    // distingue rol vs multiplicidad — esa distinción se pierde).
    if (label?.trim()) role = label.trim()
    warnings.push({
      code: 'unparsed-end-label',
      message: parsed.error,
      targetId: link.id,
    })
  } else if (parsed.multiplicity) {
    multiplicity = parsed.multiplicity
  }

  if (!classifierId) {
    warnings.push({
      code: 'end-without-class',
      message: `Extremo ${which} de "${link.id}" no referencia una clase del diagrama.`,
      targetId: link.id,
    })
  }

  const type: UMLTypeReference = classifierId
    ? { kind: 'classifier', name: nodeName, classifierId }
    : { kind: 'external', name: nodeName || '(sin clase)' }

  return {
    id: `end-${link.id}-${isSrc ? 'src' : 'tgt'}`,
    type,
    role,
    multiplicity,
    isNavigable: false, // El Canvas no modela navegabilidad explícita
    isOrdered: false,
    isUnique: true, // Default UML de unicidad
    aggregation,
  }
}

function makeViewLink(l: LinkEdge): UMLDiagramLink {
  return {
    id: viewLinkId(l.id),
    semanticElementId: l.id,
    sourceElementId: viewElementId(l.sourceId),
    targetElementId: viewElementId(l.targetId),
    anchorSrc: l.anchorSrc ?? null,
    anchorTgt: l.anchorTgt ?? null,
  }
}
