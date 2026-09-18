// src/core/uml/uml.extensions.ts
// EXTENSIONES DE PERSISTENCIA / CODEGEN.
//
// Este archivo NO contiene semántica UML 2.5.1: son metadatos de NUESTRA
// aplicación para persistencia (SQLite) y generación de código (Spring Boot).
//
// Se mantienen ABIERTAMENTE separados del modelo UML para que un UMLClass
// jamás se trate como una tabla de base de datos automáticamente.

/**
 * Metadatos de persistencia de un classifier.
 *
 * - `primaryKeyPropertyId` se declara EXPLÍCITAMENTE; NO se infiere de que
 *   un atributo se llame "id". Una clase UML puede no tener PK.
 * - No agregar atributos sintéticos (`id1`) aquí: la persistencia debe
 *   derivarse de propiedades UML existentes o ignorarse.
 */
export interface PersistenceMetadata {
  /** Id del UMLClassifier al que aplica. */
  classifierId: string

  /** Nombre de tabla alternativo al del classifier. */
  tableName?: string

  /** Id de la UMLProperty que actúa como clave primaria (si existe). */
  primaryKeyPropertyId?: string

  /** Índices adicionales (claves secundarias, unicidad). */
  indexes?: Array<{
    name?: string
    propertyIds: string[]
    unique?: boolean
  }>
}

/**
 * Metadatos de generación de código del classifier.
 *
 * Solo define el CONTRATO; el generador Spring Boot se implementará en fases
 * posteriores consumiendo estos flags.
 */
export interface CodegenMetadata {
  /** Id del UMLClassifier al que aplica. */
  classifierId: string

  javaPackage?: string

  javaClassName?: string

  generateEntity?: boolean
  generateDto?: boolean
  generateRepository?: boolean
  generateService?: boolean
  generateController?: boolean
}