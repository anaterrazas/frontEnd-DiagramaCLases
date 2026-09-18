// src/modules/editor/adapters/index.ts
// Capa de adaptación Canvas ↔ UMLModel (Fase 2).
//
// Funciones de conversión PURA: no mutan el engine, no usan red, no tocan
// el estado global. Solo convierten entre el modelo del Canvas actual (texto
// plano) y el modelo semántico canónico UML 2.5.1 (src/core/uml).

// ---- Parsers (texto del Canvas → estructuras UML) ----
export {
  parseCanvasAttribute,
  parseCanvasMethod,
  parseMultiplicityText,
  makeTypeReference,
  CANVAS_PRIMITIVE_TYPES,
} from './uml.parsers'
export type { ParsedUmlProperty } from './uml.parsers'

// ---- Formatters (estructuras UML → texto del Canvas) ----
export {
  formatUmlProperty,
  formatUmlOperation,
  formatMultiplicity,
  isDefaultMultiplicity,
  visibilityToSymbol,
  typeReferenceToName,
} from './uml.formatters'

// ---- Conversión global ----
export { canvasToUml } from './canvasToUml'
export { umlToCanvas } from './umlToCanvas'

// ---- Tipos del adapter ----
export type {
  AdapterWarning,
  CanvasToUmlResult,
  UmlToCanvasResult,
} from './types'