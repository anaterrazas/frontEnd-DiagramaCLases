import type { UMLModel, UMLAppFormatVersion } from './uml.model'
import type { UMLDiagramView } from './uml.visual'

export interface UMLProjectDocument {
  id: string
  name: string
  formatVersion: UMLAppFormatVersion
  model: UMLModel
  diagrams: UMLDiagramView[]
  activeDiagramId?: string
}
