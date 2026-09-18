// src/core/uml/uml.types.ts
// Tipos base del modelo semántico UML 2.5.1 (valor, sin identidad propia).
// Semántica UML estándar salvo lo indicado explícitamente.

import type {
  UMLTypeReferenceKind,
} from './uml.enums'

/**
 * Multiplicidad de una Property, extremo de asociación o parámetro
 * (UML 2.5.1 §7.5.2 Multiplicity / MultiplicityRange).
 *
 * - `lower <= upper`, ambos >= 0
 * - `upper: '*'` representa infinito
 * - `1` se modela como `{ lower: 1, upper: 1 }`
 */
export interface UMLMultiplicity {
  lower: number
  upper: number | '*'
}

/** Creador de multiplicidades. Conveniente para construir el modelo a mano. */
export function umlMultiplicity(lower: number, upper: number | '*'): UMLMultiplicity {
  return { lower, upper }
}

/** Presets de multiplicidad más habituales. */
export const UML_MULTIPLICITY_FACTORIES = {
  /** `1` */
  one: (): UMLMultiplicity => ({ lower: 1, upper: 1 }),
  /** `0..1` */
  zeroOne: (): UMLMultiplicity => ({ lower: 0, upper: 1 }),
  /** `*` */
  star: (): UMLMultiplicity => ({ lower: 0, upper: '*' }),
  /** `0..*` */
  zeroStar: (): UMLMultiplicity => ({ lower: 0, upper: '*' }),
  /** `1..*` */
  oneStar: (): UMLMultiplicity => ({ lower: 1, upper: '*' }),
  /** rango acotado: `2..5` → `UM_MULTIPLICITY_FACTORIES.range(2, 5)` */
  range: (lower: number, upper: number): UMLMultiplicity => ({ lower, upper }),
} as const

/**
 * Referencia tipada a un tipo (UML 2.5.1 Type).
 *
 * El tipo NUNCA debe contener multiplicidad; la multiplicidad vive en
 * UMLMultiplicity de la Property/Parámetro/Extremo.
 *
 * - `kind: 'primitive'`   → `{ kind: 'primitive', name: 'string' }`
 * - `kind: 'classifier'`  → `{ kind: 'classifier', name: 'Persona', classifierId: 'class-persona' }`
 * - `kind: 'external'`    → `{ kind: 'external', name: 'UUID', classifierId?: undefined }`
 */
export interface UMLTypeReference {
  kind: UMLTypeReferenceKind
  name: string
  /** Obligatorio cuando `kind === 'classifier'`: id del UMLClassifier referenciado. */
  classifierId?: string
}

/**
 * Estereotipo básico UML 2.5.1 (§12.2 Stereotype).
 *
 * Representación mínima (solo nombre) pensada para ampliarse en futuras fases.
 * No se modela aún el sistema completo de perfiles.
 */
export interface UMLStereotype {
  id?: string
  name: string
}