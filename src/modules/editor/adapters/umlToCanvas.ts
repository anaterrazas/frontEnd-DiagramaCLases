// src/modules/editor/adapters/umlToCanvas.ts
//
// Adapter UMLModel → Canvas.
//
// Función PURA: recibe un UMLModel (+ UMLDiagramView con geometría/anclas) y
// produce un DiagramModel que el Canvas actual puede consumir (atributos/
// métodos en texto plano, links con kind/labels del motor).

import type {
  UMLClassifier,
  UMLDiagramView,
  UMLModel,
} from '@/core/uml'
import type {
  DiagramModel,
  LinkEdge,
  RelationKind,
} from '@/modules/editor/services/canvas.engine'
import { formatUmlOperation, formatUmlProperty, formatMultiplicity, isDefaultMultiplicity } from './uml.formatters'
import type { AdapterWarning, UmlToCanvasResult } from './types'

/**
 * Convierte un UMLModel + su vista en el DiagramModel del Canvas.
 *
 * Pérdidas controladas (devueltas como warnings, nunca errores):
 *  - interfaces / enumeraciones / realizaciones no tienen representación en el Canvas
 *  - roles y navegabilidad no tienen campo propio en el Canvas
 *  - anclas: si la vista no trae UMLDiagramLink se pierden (default null)
 */
export function umlToCanvas(
  model: UMLModel,
  view: UMLDiagramView = { id: 'uml-view', elements: [] },
): UmlToCanvasResult {
  const warnings: AdapterWarning[] = []
  const classes: DiagramModel['classes'] = {}
  const links: DiagramModel['links'] = {}

  const elementBySemanticId = new Map<string, NonNullable<UMLDiagramView['elements']>[number]>()
  for (const el of view.elements ?? []) elementBySemanticId.set(el.semanticElementId, el)

  const linkViewBySemanticId = new Map<string, NonNullable<UMLDiagramView['links']>[number]>()
  for (const lv of view.links ?? []) linkViewBySemanticId.set(lv.semanticElementId, lv)

  /* ---------------- Clases ---------------- */
  for (const c of model.classifiers ?? []) {
    if (c.kind !== 'class') {
      emitClassifierLoss(c, warnings)
      continue
    }
    const el = elementBySemanticId.get(c.id)
    classes[c.id] = {
      id: c.id,
      x: el?.x ?? 0,
      y: el?.y ?? 0,
      w: el?.width ?? 170,
      h: el?.height ?? 70,
      name: c.name,
      attributes: (c.attributes ?? []).map(formatUmlProperty),
      methods: (c.operations ?? []).map(formatUmlOperation),
    }

    if (c.isAbstract) {
      warnings.push({
        code: 'abstract-not-represented',
        message: `La clase abstracta "${c.name}" se vuelca al Canvas sin marcarla como abstracta (el Canvas no lo soporta).`,
        targetId: c.id,
      })
    }
  }

  /* ---------------- Asociaciones ---------------- */
  for (const a of model.associations ?? []) {
    const kind: RelationKind = relationKindOf(a, warnings)

    const lv = linkViewBySemanticId.get(a.id)
    const srcId = lv?.sourceElementId ?? a.ends[0]?.type.classifierId
    const tgtId = lv?.targetElementId ?? a.ends[1]?.type.classifierId
    if (!srcId || !tgtId) {
      warnings.push({
        code: 'association-without-ends',
        message: `La asociación "${a.id}" no tiene extremos resolubles; no se vuelca al Canvas.`,
        targetId: a.id,
      })
      continue
    }

    const srcLabel = labelOfEnd(a.ends[0])
    const tgtLabel = labelOfEnd(a.ends[1])

    const link: LinkEdge = {
      id: a.id,
      kind,
      sourceId: srcId,
      targetId: tgtId,
      labels: {
        name: a.name || undefined,
        src: srcLabel || undefined,
        tgt: tgtLabel || undefined,
      },
      anchorSrc: lv?.anchorSrc ?? null,
      anchorTgt: lv?.anchorTgt ?? null,
    }

    // Clase de asociación: se enlaza como assocClassId (semántica conservada)
    const ac = model.associationClasses?.find((x) => x.associationId === a.id)
    if (ac) link.assocClassId = ac.classId

    links[a.id] = link
  }

  /* ---------------- Generalizaciones ---------------- */
  for (const g of model.generalizations ?? []) {
    const lv = linkViewBySemanticId.get(g.id)
    links[g.id] = {
      id: g.id,
      kind: 'Generalize',
      sourceId: g.specificId,
      targetId: g.generalId,
      labels: {},
      anchorSrc: lv?.anchorSrc ?? null,
      anchorTgt: lv?.anchorTgt ?? null,
    }
  }

  /* ---------------- Dependencias ---------------- */
  for (const d of model.dependencies ?? []) {
    const lv = linkViewBySemanticId.get(d.id)
    links[d.id] = {
      id: d.id,
      kind: 'Dependency',
      sourceId: d.clientId,
      targetId: d.supplierId,
      labels: {},
      anchorSrc: lv?.anchorSrc ?? null,
      anchorTgt: lv?.anchorTgt ?? null,
    }
  }

  /* ---------------- Realizaciones ---------------- */
  for (const r of model.realizations ?? []) {
    warnings.push({
      code: 'realization-not-represented',
      message: `Realización "${r.id}" (${r.clientId} → ${r.supplierId}) no tiene representación en el Canvas; se omite.`,
      targetId: r.id,
    })
  }

  return { model: { classes, links }, warnings }
}

/** Tipo de relación del motor según la agregación de sus extremos. */
function relationKindOf(a: UMLModel['associations'][number], warnings: AdapterWarning[]): RelationKind {
  const composites = a.ends.filter((e) => e.aggregation === 'composite').length
  const shared = a.ends.filter((e) => e.aggregation === 'shared').length

  if (composites > 0) {
    if (shared > 0) {
      warnings.push({
        code: 'mixed-aggregation',
        message: `Asociación "${a.id}" mezcla composición y agregación; el Canvas solo admite UN rombo (se prioriza composición).`,
        targetId: a.id,
      })
    }
    return 'Compose'
  }
  if (shared > 0) return 'Aggregate'
  return 'Associate'
}

/** Etiqueta del extremo: multiplicidad (o rol si es el único dato significativo). */
function labelOfEnd(end: UMLModel['associations'][number]['ends'][number] | undefined): string | undefined {
  if (!end) return undefined
  // Siempre emitimos la multiplicidad; si es {1,1} emitimos "1" para conservarla
  // en el round-trip (el motor Canvas usa labels.src/tgt como multiplicidad).
  return formatMultiplicity(end.multiplicity)
}

function emitClassifierLoss(c: UMLClassifier, warnings: AdapterWarning[]): void {
  if (c.kind === 'interface') {
    warnings.push({
      code: 'interface-not-represented',
      message: `La interfaz "${c.name}" no tiene representación en el Canvas actual; se omite.`,
      targetId: c.id,
    })
  } else if (c.kind === 'enumeration') {
    warnings.push({
      code: 'enumeration-not-represented',
      message: `La enumeración "${c.name}" no tiene representación en el Canvas actual; se omite.`,
      targetId: c.id,
    })
  }
}