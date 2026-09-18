// src/core/uml/uml.model.ts
// Modelo semántico canónico UML 2.5.1 (subconjunto orientado a diagramas de clases).
//
// Este archivo contiene SOLO semántica UML. La geometría / vista vive en
// `uml.visual.ts` y las extensiones de persistencia/codegen en `uml.extensions.ts`.
//
// Regla de identidad: todos los elementos tienen `id: string` estable.
// Las relaciones entre elementos SIEMPRE apuntan por id, nunca por referencia circular.

import type {
  UMLAggregation,
  UMLParameterDirection,
  UMLVisibility,
} from './uml.enums'
import type {
  UMLMultiplicity,
  UMLStereotype,
  UMLTypeReference,
} from './uml.types'

/** Versión de UML declarada por el modelo (UML 2.5.1). */
export const UML_VERSION = '2.5.1' as const
export type UMLVersion = typeof UML_VERSION

/**
 * Versión del formato JSON de proyecto de NUESTRA aplicación.
 * NO confundir con UML_VERSION ("2.5.1") — son versiones distintas.
 */
export const UML_APP_FORMAT_VERSION = '1.0' as const
export type UMLAppFormatVersion = typeof UML_APP_FORMAT_VERSION

/**
 * Propiedad UML: atributo de clase o extremo/propiedad en general
 * (UML 2.5.1 §9.5.4 Property).
 *
 * `isID` NO es parte del estándar: es una extensión propia que la
 * persistencia/codegen puede usar para deducir identidad. No implica que
 * UML obligue a una clave primaria.
 */
export interface UMLProperty {
  id: string
  name: string
  type: UMLTypeReference
  visibility: UMLVisibility

  multiplicity: UMLMultiplicity

  isOrdered: boolean
  isUnique: boolean
  isReadOnly: boolean
  isStatic: boolean
  isDerived: boolean

  /** Valor por defecto (texto literal) o undefined. */
  defaultValue?: string

  aggregation: UMLAggregation

  /** [EXTENSIÓN PROPIA] marca el atributo como identificador lógico del elemento. */
  isID?: boolean

  stereotypes?: UMLStereotype[]
}

/**
 * Parámetro de operación (UML 2.5.1 §9.3.5 Parameter).
 *
 * Los parámetros son ESTRUCTURADOS: el nombre de la operación no incluye
 * paréntesis. `{ name: "login", parameters: [...] }`, nunca
 * `{ name: "login(usuario: String)" }`.
 */
export interface UMLParameter {
  id: string
  name: string
  type: UMLTypeReference

  direction: UMLParameterDirection

  multiplicity: UMLMultiplicity

  defaultValue?: string
}

/**
 * Operación UML (UML 2.5.1 §9.5.4 Operation).
 *
 * `name` contiene SOLO el nombre (sin paréntesis, sin parámetros).
 */
export interface UMLOperation {
  id: string
  name: string
  visibility: UMLVisibility

  parameters: UMLParameter[]

  returnType?: UMLTypeReference

  isAbstract: boolean
  isStatic: boolean

  /** [EXTENSIÓN PROPIA] marca operaciones sin efecto (consulta). */
  isQuery?: boolean

  stereotypes?: UMLStereotype[]
}

/**
 * Clase UML (UML 2.5.1 §11.4 Class).
 *
 * Soporta clases abstractas (`isAbstract`) y estereotipos.
 */
export interface UMLClass {
  kind: 'class'
  id: string
  name: string
  visibility: UMLVisibility

  isAbstract: boolean

  attributes: UMLProperty[]
  operations: UMLOperation[]

  stereotypes?: UMLStereotype[]
}

/**
 * Interfaz UML (UML 2.5.1 §11.6 Interface).
 */
export interface UMLInterface {
  kind: 'interface'
  id: string
  name: string
  visibility: UMLVisibility

  operations: UMLOperation[]

  /** Opcional: UML permite atributos constantes en interfaces. */
  attributes?: UMLProperty[]

  stereotypes?: UMLStereotype[]
}

/**
 * Literal de una enumeración (UML 2.5.1 §11.4.4 EnumerationLiteral).
 */
export interface UMLEnumerationLiteral {
  id: string
  name: string
}

/**
 * Enumeración UML (UML 2.5.1 §11.4.3 Enumeration).
 */
export interface UMLEnumeration {
  kind: 'enumeration'
  id: string
  name: string
  visibility: UMLVisibility

  literals: UMLEnumerationLiteral[]

  stereotypes?: UMLStereotype[]
}

/**
 * Discriminador de classifier: todo classifier lleva `kind` y es
 * referenciable por `id` desde UMLTypeReference (`kind: 'classifier'`).
 */
export type UMLClassifier = UMLClass | UMLInterface | UMLEnumeration

/**
 * Extremo de asociación (UML 2.5.1 §11.5.4 Association / Property de extremo).
 *
 * Permite modelar roles, multiplicidad y navegabilidad por extremo:
 * `Persona 1 ─── 0..* Mascota`.
 */
export interface UMLAssociationEnd {
  id: string

  type: UMLTypeReference

  role?: string

  multiplicity: UMLMultiplicity

  isNavigable: boolean
  isOrdered: boolean
  isUnique: boolean

  aggregation: UMLAggregation
}

/**
 * Asociación UML (UML 2.5.1 §11.5 Association).
 *
 * La estructura NO limita a dos extremos: `ends` es un array para poder
 * evolucionar hacia asociaciones n-arias.
 *
 * `associationClassId` referencia una UMLAssociationClass (por id).
 */
export interface UMLAssociation {
  id: string
  name?: string

  ends: UMLAssociationEnd[]

  isDerived?: boolean

  stereotypes?: UMLStereotype[]

  associationClassId?: string
}

/**
 * Generalización (herencia): `specificId` especializa a `generalId`
 * (UML 2.5.1 §9.5.2 Generalization).
 */
export interface UMLGeneralization {
  id: string

  specificId: string
  generalId: string
}

/**
 * Dependencia: `clientId` depende de `supplierId` (UML 2.5.1 §9.7 Dependency).
 */
export interface UMLDependency {
  id: string

  clientId: string
  supplierId: string
}

/**
 * Realización: `clientId` implementa la interfaz `supplierId`
 * (UML 2.5.1 §9.8 Realization). Modela `Clase ─ ─ ─▷ Interface`.
 */
export interface UMLRealization {
  id: string

  clientId: string
  supplierId: string
}

/**
 * Clase de asociación: une una UMLClass (`classId`) con una UMLAssociation
 * (`associationId`).
 */
export interface UMLAssociationClass {
  id: string

  classId: string
  associationId: string
}

/**
 * Paquete UML (UML 2.5.1 §12.3 Package).
 *
 * `classifierIds` referencia por id a classifiers. Los subpaquetes son
 * contención (no referencia circular).
 */
export interface UMLPackage {
  id: string
  name: string

  packages?: UMLPackage[]

  classifierIds: string[]

  stereotypes?: UMLStereotype[]
}

/**
 * Modelo raíz: contenedor canónico de un diagrama de clases UML 2.5.1.
 *
 * - `umlVersion` : versión del estándar UML ("2.5.1")
 * - `formatVersion`: versión de NUESTRO formato de proyecto ("1.0")
 *
 * Las relaciones se guardan SIEMPRE por id de clasificador.
 */
export interface UMLModel {
  id: string

  name: string

  umlVersion: UMLVersion

  formatVersion: UMLAppFormatVersion

  packages: UMLPackage[]

  classifiers: UMLClassifier[]

  associations: UMLAssociation[]

  generalizations: UMLGeneralization[]

  dependencies: UMLDependency[]

  realizations: UMLRealization[]

  associationClasses: UMLAssociationClass[]

  stereotypes: UMLStereotype[]
}