// src/core/uml/uml.enums.ts
// Enumeraciones del modelo semántico canónico UML 2.5.1 (subconjunto diagramas de clases).
// Semántica UML estándar. Nada de esto es extensión propia.

/**
 * Visibilidad de un elemento UML 2.5.1 (§7.6.4 VisibilityKind).
 *
 * 'package' == '~'
 */
export type UMLVisibility = 'public' | 'private' | 'protected' | 'package'

/** Valores válidos de UMLVisibility (para validar datos entrantes). */
export const UML_VISIBILITIES: readonly UMLVisibility[] = ['public', 'private', 'protected', 'package']

/**
 * Tipo de agregación de una Property / extremo de asociación
 * (UML 2.5.1 §11.5.4 AggregationKind).
 *
 * - 'none'     : agregación por asociación simple
 * - 'shared'   : agregación (rombo blanco)
 * - 'composite': composición (rombo negro)
 */
export type UMLAggregation = 'none' | 'shared' | 'composite'

/** Valores válidos de UMLAggregation. */
export const UML_AGGREGATION_KINDS: readonly UMLAggregation[] = ['none', 'shared', 'composite']

/**
 * Dirección de un parámetro de operación (UML 2.5.1 §9.3.5 ParameterDirectionKind).
 */
export type UMLParameterDirection = 'in' | 'out' | 'inout' | 'return'

/** Valores válidos de UMLParameterDirection. */
export const UML_PARAMETER_DIRECTIONS: readonly UMLParameterDirection[] = ['in', 'out', 'inout', 'return']

/**
 * Discriminador del classifier UML (UML 2.5.1 §9.2.4 en adelante).
 */
export type UMLClassifierKind = 'class' | 'interface' | 'enumeration'

/** Valores válidos de UMLClassifierKind. */
export const UML_CLASSIFIER_KINDS: readonly UMLClassifierKind[] = ['class', 'interface', 'enumeration']

/**
 * Totalidad de una referencia a tipo (extensión de la aplicación para modelar tipos).
 *
 * - 'primitive' : tipo primitivo predefinido (string, int, bool, date…)
 * - 'classifier': referencia a otro classifier por id (UML)
 * - 'external'  : tipo fuera del modelo (paquete/módulo externo)
 */
export type UMLTypeReferenceKind = 'primitive' | 'classifier' | 'external'

/** Valores válidos de UMLTypeReferenceKind. */
export const UML_TYPE_REFERENCE_KINDS: readonly UMLTypeReferenceKind[] = ['primitive', 'classifier', 'external']