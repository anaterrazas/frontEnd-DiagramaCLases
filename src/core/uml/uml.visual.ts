// src/core/uml/uml.visual.ts
// MODELO VISUAL (vista de diagrama).
//
// IMPORTANTE: este archivo NO es UML. Es la representación geométrica/visual
// de un diagrama, separada del modelo semántico (`uml.model.ts`).
//
// `semanticElementId` apunta por id a un elemento semántico
// (classifier, association, generalización, …). El Canvas NO será el modelo.

import type { UmlIdentity } from './identity'

/** Lado del borde de la caja al que se ancla un extremo de enlace. */
export type UMLAnchorSide = 'L' | 'R' | 'T' | 'B'

/** Ancla de un extremo de enlace sobre el borde de una caja (`t` en 0..1). */
export interface UMLAnchor {
  side: UMLAnchorSide
  t: number
}

/**
 * Posición/tamaño de un elemento visual en coordenadas de lienzo.
 * Estilo y metadatos de presentación (no semántica).
 */
export interface UMLDiagramElement {
  id: string
  identity?: UmlIdentity

  /** Id del elemento semántico representado (UMLClassifier, UMLAssociation, …). */
  semanticElementId: string

  x: number
  y: number

  width: number
  height: number

  /** Orden de apilado en el lienzo. */
  zIndex?: number

  /** Oculto del lienzo (sigue existiendo en el modelo semántico). */
  hidden?: boolean

  /** Colapsado visualmente (p. ej. sección atributos/métodos). */
  collapsed?: boolean

  /** Estilo de presentación (colores, fuente…). NO tiene semántica UML. */
  style?: Record<string, unknown>
}

/**
 * Enlace visual entre dos cajas de un diagrama.
 *
 * NO es semántica UML: conserva geometría de presentación (dirección visual
 * y anclas de extremo) que el modelo semántico (UMLAssociation,
 * UMLGeneralization, UMLDependency) no debe contener.
 */
export interface UMLDiagramLink {
  id: string

  /** Id del elemento semántico que este enlace representa. */
  semanticElementId: string

  /** Id visual del elemento de origen (UMLDiagramElement.semanticElementId). */
  sourceElementId: string

  /** Id visual del elemento de destino (UMLDiagramElement.semanticElementId). */
  targetElementId: string

  anchorSrc?: UMLAnchor | null
  anchorTgt?: UMLAnchor | null

  /** Estilo de presentación. NO tiene semántica UML. */
  style?: Record<string, unknown>
}

/**
 * Vista de diagrama: agrupa elementos visuales de UN diagrama.
 * No forma parte del núcleo semántico UML.
 */
export interface UMLDiagramView {
  id: string

  name?: string

  elements: UMLDiagramElement[]

  /** Enlaces visuales (anclas / direccionalidad) — no semánticos. */
  links?: UMLDiagramLink[]
}
