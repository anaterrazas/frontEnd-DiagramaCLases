// src/core/uml/index.ts
// Exportación pública del modelo semántico canónico UML 2.5.1.
//
// Uso futuro (Fase 2 en adelante):
//   import type { UMLModel } from '@/core/uml'

// ---- Enums (semántica UML) ----
export type {
  UMLVisibility,
  UMLAggregation,
  UMLParameterDirection,
  UMLClassifierKind,
  UMLTypeReferenceKind,
} from './uml.enums'
export {
  UML_VISIBILITIES,
  UML_AGGREGATION_KINDS,
  UML_PARAMETER_DIRECTIONS,
  UML_CLASSIFIER_KINDS,
  UML_TYPE_REFERENCE_KINDS,
} from './uml.enums'

// ---- Tipos base (semántica UML) ----
export type {
  UMLMultiplicity,
  UMLTypeReference,
  UMLStereotype,
} from './uml.types'
export { umlMultiplicity, UML_MULTIPLICITY_FACTORIES } from './uml.types'

// ---- Modelo semántico (semántica UML 2.5.1) ----
export type {
  UMLProperty,
  UMLParameter,
  UMLOperation,
  UMLClass,
  UMLInterface,
  UMLEnumeration,
  UMLEnumerationLiteral,
  UMLClassifier,
  UMLAssociationEnd,
  UMLAssociation,
  UMLGeneralization,
  UMLDependency,
  UMLRealization,
  UMLAssociationClass,
  UMLPackage,
  UMLModel,
  UMLVersion,
  UMLAppFormatVersion,
} from './uml.model'
export { UML_VERSION, UML_APP_FORMAT_VERSION } from './uml.model'

// ---- Vista (modelo visual, NO semántico) ----
export type {
  UMLDiagramView,
  UMLDiagramElement,
  UMLDiagramLink,
  UMLAnchor,
  UMLAnchorSide,
} from './uml.visual'

// ---- Documento de proyecto (formato app) ----
export type {
  UMLProjectDocument,
} from './uml.project'
export type {
  CreateUmlProjectDocumentInput,
  UMLProjectDocumentValidationResult,
  LoadUmlProjectDocumentResult,
} from './uml.project.serialization'
export {
  createUmlProjectDocument,
  serializeUmlProjectDocument,
  loadUmlProjectDocumentFromJson,
  validateUmlProjectDocument,
} from './uml.project.serialization'

// ---- Extensiones propias (NO semántica UML) ----
export type {
  PersistenceMetadata,
  CodegenMetadata,
} from './uml.extensions'
