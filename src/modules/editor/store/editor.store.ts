// @/modules/editor/store/editor.store.ts
import { defineStore } from 'pinia'
import type { CanvasEngine, RelationKind } from '@/modules/editor/services/canvas.engine'
import { downloadSpringBootProject, importarBocetoService, sendPrompt, downloadFlutter } from '../services/editorService'
import { offlineService } from '@/modules/offline/services/offline.service'
import type { OfflineInitializeResult } from '@/modules/offline/models/offline.models'
import { canvasToUml, makeTypeReference, parseMultiplicityText, umlToCanvas } from '../adapters'
import type { AdapterWarning, CanvasToUmlResult } from '../adapters'
import { canvasSnapshotToUmlProjectDocument } from '../adapters/canvasToUmlProjectDocument'
import { umlProjectDocumentToCanvas } from '../adapters/umlProjectDocumentToCanvas'
import { importEnterpriseArchitectXmi } from '@/core/uml/xmi'
import {
  downloadUmlProjectDocument,
  readUmlProjectDocumentFile,
} from '@/core/uml/persistence'
import type {
  UMLAggregation,
  UMLAnchor,
  UMLAssociationEnd,
  UMLClass,
  UMLDiagramView,
  UMLModel,
  UMLMultiplicity,
  UMLParameterDirection,
  UMLTypeReference,
  UMLVisibility,
} from '@/core/uml'

export type Tool = 'select' | 'add-class' | 'add-link' | 'add-assoc-class'
type ImportMode = 'append' | 'replace'

/** (Opcional) tipado del JSON “simple” si no fuera v2 */
type ImportedDiagramSimple = {
  classes?: Array<{
    id?: string
    name: string
    x?: number
    y?: number
    w?: number
    h?: number
    attributes?: Array<{
      name: string
      type?: string
      visibility?: string
      vis?: string
      default?: unknown
      initialValue?: unknown
      readonly?: boolean
      static?: boolean
      multiplicity?: string
    }>
    methods?: Array<{
      name?: string
      params?: Array<{ name?: string; type?: string; default?: unknown; initialValue?: unknown }>
      returnType?: string
      type?: string
      visibility?: string
      vis?: string
      static?: boolean
      abstract?: boolean
    }>
  }>
  relations?: Array<{
    id?: string
    from?: string
    to?: string
    sourceId?: string
    targetId?: string
    kind: RelationKind | 'AssociationClass' | string
    labels?: Record<string, string>
    assocClassId?: string
    anchorSrc?: any
    anchorTgt?: any
  }>
}

/** Kind de relación que las operaciones semánticas pueden crear (Fase 3B). */
export type UmlRelationshipKind = 'Association' | 'Aggregation' | 'Composition' | 'Generalization' | 'Dependency'

/** Estrategia de IDs del proyecto: UUID v4 (la misma que usa el engine en addClass/addLink). */
function newUmlElementId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Índice nombre-de-classifier → id (resuelve UMLTypeReference kind 'classifier'). */
function umlClassifierNameToId(model: UMLModel): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of model.classifiers ?? []) map.set(c.name, c.id)
  return map
}

/** Busca un UMLClass por id entre los classifiers del modelo. */
function umlFindClass(model: UMLModel, classId: string): UMLClass | undefined {
  return (model.classifiers ?? []).find((c) => c.kind === 'class' && c.id === classId) as UMLClass | undefined
}

/** Normaliza multiplicidad (texto del Canvas o estructurada) a UMLMultiplicity. */
function normalizeUmlMultiplicity(m: string | UMLMultiplicity | undefined): UMLMultiplicity {
  if (m && typeof m === 'object' && typeof m.lower === 'number' && (m.upper === '*' || typeof m.upper === 'number')) {
    return { lower: m.lower, upper: m.upper }
  }
  if (typeof m === 'string') {
    const parsed = parseMultiplicityText(m)
    if (parsed.multiplicity) return parsed.multiplicity
  }
  return { lower: 1, upper: 1 }
}

/** Resuelve un type (texto del Canvas o UMLTypeReference) a UMLTypeReference. */
function resolveUmlTypeReference(
  t: string | UMLTypeReference | undefined | null,
  nameToId: Map<string, string>,
): UMLTypeReference | undefined {
  if (!t) return undefined
  if (typeof t === 'object') return t
  return makeTypeReference(t, nameToId)
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    // ---- Editor / Canvas
    engine: null as CanvasEngine | null,

    // ---- Modelo semántico UML (Fase 3A) — sincronizado de forma CONTROLADA
    // Fuente semántica canónica derivada del Canvas. El Canvas NO cambia.
    umlModel: null as UMLModel | null,
    umlView: null as UMLDiagramView | null,
    umlWarnings: [] as AdapterWarning[],

    selected: { kind: null as null | 'class' | 'link', id: null as string | null },
    tool: 'select' as Tool,
    firstForLink: null as string | null,
    relationKind: 'Associate' as RelationKind,

    // ---- Loading
    loadingExport: false,
    loadingImport: false,
    loadingPrompt: false,

    // ---- Realtime (inyectado desde useSalaSocket)
    // Debe ser un callback sin argumentos que emita state:replace usando el engine actual
    broadcastReplace: null as null | (() => void),
  }),
  getters: {
    selectedId(state): string | null {
      return state.selected.kind === 'class' ? state.selected.id : null
    },
    loading(state): boolean {
      return state.loadingExport || state.loadingImport
    },
  },
  actions: {
    /** Initializes the isolated local database from the typed UML v2 export. */
    async initializeOfflineDatabase(): Promise<OfflineInitializeResult> {
      if (!this.engine) throw new Error('Engine no inicializado')
      return offlineService.initializeFromUml(this.engine.toExportJSONv2())
    },

    /* =========================
       SINCRONIZACIÓN UML (Fase 3A)
       Canvas → canvasToUml → UMLModel (fuente semántica canónica).
       El flujo actual (JSON v2 / Offline / IA / CodeGen / Socket) NO cambia.
    ========================== */
    /** Sincroniza el UMLModel (y su vista + warnings) desde el estado actual del Canvas.
     * Conserva IDs semánticos existentes (UUIDs) haciendo merge inteligente:
     * - Clases: match por classId (que sí es estable en CanvasEngine)
     * - Atributos/Operaciones: match por nombre+tipo+visibilidad para preservar UUIDs
     * - Relaciones: match por linkId (estable en CanvasEngine)
     */
    syncUmlModelFromCanvas(): CanvasToUmlResult | null {
      if (!this.engine) return null
      const result = canvasToUml(this.engine.toJSON())
      const incoming = result.model

      // Si no hay modelo previo, usar el incoming directamente
      if (!this.umlModel) {
        this.umlModel = incoming
        this.umlView = result.view
        this.umlWarnings = result.warnings
        return result
      }

      // ---- Merge inteligente para conservar UUIDs ----
      this.umlModel = this.mergeUmlModels(this.umlModel, incoming)
      this.umlView = result.view
      this.umlWarnings = result.warnings
      return result
    },

    /** Combina dos UMLModels preservando UUIDs existentes siempre que sea posible. */
    mergeUmlModels(existing: UMLModel, incoming: UMLModel): UMLModel {
      const merged: UMLModel = { ...existing, classifiers: [], associations: [], generalizations: [], dependencies: [], realizations: [], associationClasses: [] }

      // --- Clases: merge por classId ---
      const existingClassById = new Map(existing.classifiers.map(c => [c.id, c]))
      const incomingClassById = new Map(incoming.classifiers.map(c => [c.id, c]))

      for (const inc of incoming.classifiers) {
        const ext = existingClassById.get(inc.id)
        if (ext) {
          // Clase existente: preservar su ID y mergear atributos/operaciones
          merged.classifiers.push(this.mergeUmlClass(ext, inc))
        } else {
          // Clase nueva: usar tal cual (con UUIDs frescos del adapter)
          merged.classifiers.push(inc)
        }
      }

      // --- Relaciones: merge por relationId ---
      // Asociaciones
      const existingAssocById = new Map(existing.associations.map(a => [a.id, a]))
      const incomingAssocById = new Map(incoming.associations.map(a => [a.id, a]))
      for (const inc of incoming.associations) {
        const ext = existingAssocById.get(inc.id)
        if (ext) {
          // Preservar ID de la asociación y de sus extremos
          merged.associations.push(this.mergeUmlAssociation(ext, inc))
        } else {
          merged.associations.push(inc)
        }
      }

      // Generalizaciones
      const existingGenById = new Map(existing.generalizations.map(g => [g.id, g]))
      const incomingGenById = new Map(incoming.generalizations.map(g => [g.id, g]))
      for (const inc of incoming.generalizations) {
        const ext = existingGenById.get(inc.id)
        merged.generalizations.push(ext ?? inc)
      }

      // Dependencias
      const existingDepById = new Map(existing.dependencies.map(d => [d.id, d]))
      const incomingDepById = new Map(incoming.dependencies.map(d => [d.id, d]))
      for (const inc of incoming.dependencies) {
        const ext = existingDepById.get(inc.id)
        merged.dependencies.push(ext ?? inc)
      }

      // Realizaciones
      const existingRealById = new Map(existing.realizations.map(r => [r.id, r]))
      const incomingRealById = new Map(incoming.realizations.map(r => [r.id, r]))
      for (const inc of incoming.realizations) {
        const ext = existingRealById.get(inc.id)
        merged.realizations.push(ext ?? inc)
      }

      // AssociationClasses
      const existingAcById = new Map(existing.associationClasses.map(ac => [ac.id, ac]))
      const incomingAcById = new Map(incoming.associationClasses.map(ac => [ac.id, ac]))
      for (const inc of incoming.associationClasses) {
        const ext = existingAcById.get(inc.id)
        merged.associationClasses.push(ext ?? inc)
      }

      return merged
    },

/** Merge de una clase preservando UUIDs de atributos y operaciones. */
    mergeUmlClass(existing: UMLClassifier, incoming: UMLClassifier): UMLClassifier {
      if (existing.kind !== 'class' || incoming.kind !== 'class') return incoming

      // Atributos: match por name+type+visibility para preservar UUID
      // Fallback: match por índice SOLO para elementos que existían en la posición original
      // y que NO fueron matcheados por contenido
      const existingAttrsByContent = new Map<string, UMLProperty>()
      const existingAttrsByIndex = new Map<number, UMLProperty>()
      for (let i = 0; i < existing.attributes.length; i++) {
        const a = existing.attributes[i]
        const key = `${a.name}|${a.type?.name}|${a.visibility}`
        existingAttrsByContent.set(key, a)
        existingAttrsByIndex.set(i, a)
      }

      // Primera pasada: match por contenido, registrar índices originales matcheados
      const matchedOriginalIndices = new Set<number>()
      const mergedAttrs: UMLProperty[] = []
      for (let i = 0; i < incoming.attributes.length; i++) {
        const inc = incoming.attributes[i]
        const key = `${inc.name}|${inc.type?.name}|${inc.visibility}`
        const extByContent = existingAttrsByContent.get(key)
        if (extByContent) {
          mergedAttrs.push({ ...extByContent, ...inc, id: extByContent.id })
          // Encontrar el índice original de este elemento
          for (let j = 0; j < existing.attributes.length; j++) {
            const ea = existing.attributes[j]
            const ej = `${ea.name}|${ea.type?.name}|${ea.visibility}`
            if (ej === key) {
              matchedOriginalIndices.add(j)
              break
            }
          }
        } else {
          mergedAttrs.push(null as any) // placeholder
        }
      }

      // Segunda pasada: rellenar placeholders
      // Para elementos dentro del rango original: usar índice si ese índice no fue matcheado por contenido
      // Para elementos fuera del rango original: nuevo UUID
      let originalIndexCursor = 0
      for (let i = 0; i < mergedAttrs.length; i++) {
        if (mergedAttrs[i] !== null) continue
        // Buscar el siguiente índice original no matcheado
        while (originalIndexCursor < existing.attributes.length && matchedOriginalIndices.has(originalIndexCursor)) {
          originalIndexCursor++
        }
        if (originalIndexCursor < existing.attributes.length) {
          // Usar el siguiente índice original disponible
          const extByIndex = existingAttrsByIndex.get(originalIndexCursor)
          if (extByIndex) {
            mergedAttrs[i] = { ...extByIndex, ...incoming.attributes[i], id: extByIndex.id }
            matchedOriginalIndices.add(originalIndexCursor)
            originalIndexCursor++
          } else {
            mergedAttrs[i] = incoming.attributes[i]
          }
        } else {
          // Fuera del rango original: nuevo UUID
          mergedAttrs[i] = incoming.attributes[i]
        }
      }

      // Operaciones: misma lógica
      const existingOpsByContent = new Map<string, UMLOperation>()
      const existingOpsByIndex = new Map<number, UMLOperation>()
      for (let i = 0; i < existing.operations.length; i++) {
        const o = existing.operations[i]
        const key = `${o.name}|${o.visibility}|${o.returnType?.name}`
        existingOpsByContent.set(key, o)
        existingOpsByIndex.set(i, o)
      }

      // Better approach for ops: track matched original indices
      const matchedOpOriginalIndices = new Set<number>()
      const opPlaceholders2: (UMLOperation | null)[] = []
      for (let i = 0; i < incoming.operations.length; i++) {
        const inc = incoming.operations[i]
        const key = `${inc.name}|${inc.visibility}|${inc.returnType?.name}`
        const extByContent = existingOpsByContent.get(key)
        if (extByContent) {
          opPlaceholders2.push({ ...extByContent, ...inc, id: extByContent.id })
          for (let j = 0; j < existing.operations.length; j++) {
            const eo = existing.operations[j]
            const ej = `${eo.name}|${eo.visibility}|${eo.returnType?.name}`
            if (ej === key) {
              matchedOpOriginalIndices.add(j)
              break
            }
          }
        } else {
          opPlaceholders2.push(null as any)
        }
      }

      let opOriginalIndexCursor = 0
      const mergedOps: UMLOperation[] = []
      for (let i = 0; i < opPlaceholders2.length; i++) {
        if (opPlaceholders2[i] !== null) {
          mergedOps.push(opPlaceholders2[i]!)
        } else {
          while (opOriginalIndexCursor < existing.operations.length && matchedOpOriginalIndices.has(opOriginalIndexCursor)) {
            opOriginalIndexCursor++
          }
          if (opOriginalIndexCursor < existing.operations.length) {
            const extByIndex = existingOpsByIndex.get(opOriginalIndexCursor)
            if (extByIndex) {
              mergedOps.push({ ...extByIndex, ...incoming.operations[i], id: extByIndex.id })
              matchedOpOriginalIndices.add(opOriginalIndexCursor)
              opOriginalIndexCursor++
            } else {
              mergedOps.push(incoming.operations[i])
            }
          } else {
            mergedOps.push(incoming.operations[i])
          }
        }
      }

      return {
        ...incoming,
        id: existing.id,
        attributes: mergedAttrs.filter((a): a is UMLProperty => a !== null),
        operations: mergedOps,
      }
    },

    /** Merge de operación preservando UUID y mergeando parámetros por name+type. */
    mergeUmlOperation(existing: UMLOperation, incoming: UMLOperation): UMLOperation {
      // Parámetros: match por name+type para preservar UUID
      const existingParams = new Map<string, UMLParameter>()
      for (const p of existing.parameters) {
        const key = `${p.name}|${p.type?.name}`
        existingParams.set(key, p)
      }

      const mergedParams: UMLParameter[] = []
      for (const inc of incoming.parameters) {
        const key = `${inc.name}|${inc.type?.name}`
        const ext = existingParams.get(key)
        if (ext) {
          mergedParams.push({ ...ext, ...inc, id: ext.id })
        } else {
          mergedParams.push(inc)
        }
      }

      return {
        ...incoming,
        id: existing.id,
        parameters: mergedParams,
      }
    },

    /** Merge de asociación preservando UUID y de sus extremos. */
    mergeUmlAssociation(existing: UMLAssociation, incoming: UMLAssociation): UMLAssociation {
      // Extremos: match por classifierId del type (source/target)
      const mergedEnds = incoming.ends.map((incEnd, i) => {
        const extEnd = existing.ends[i]
        if (extEnd && extEnd.type.classifierId === incEnd.type.classifierId) {
          return { ...extEnd, ...incEnd, id: extEnd.id }
        }
        return incEnd
      })

      return {
        ...incoming,
        id: existing.id,
        ends: mergedEnds,
      }
    },

    /**
     * Aplica un UMLModel (+ vista opcional) al Canvas vía umlToCanvas.
     * Disponible de forma controlada (no reemplaza el flujo actual: el caller
     * decide cuándo invocarla y qué modelo usar; NO encadena sync automática).
     */
    applyUmlModelToCanvas(model?: UMLModel, view?: UMLDiagramView): void {
      if (!this.engine) return
      const target = model ?? this.umlModel
      if (!target) return
      const v = view ?? this.umlView ?? { id: 'uml-view', elements: [], links: [] }
      const result = umlToCanvas(target, v)
      this.umlWarnings = result.warnings
      this.engine.fromJSON(result.model)
    },

    /* =========================
       OPERACIONES SEMÁNTICAS UML (Fase 3B)
       Fuente semántica: UMLModel. El Canvas es una representación DERIVADA:
       cada operación muta el UMLModel y luego vuelca el resultado con
       applyUmlModelToCanvas() (umlToCanvas). No hay watchers ni cascadas
       Canvas → UML → Canvas: la sync sigue siendo explícita.
    ========================== */

    /** Garantiza umlModel/umlView cargados (sync explícita sobre el Canvas actual). */
    ensureUmlModel(): boolean {
      if (!this.engine) return false
      if (!this.umlModel || !this.umlView) this.syncUmlModelFromCanvas()
      return !!this.umlModel && !!this.umlView
    },

    /** Crea una UMLClass nueva; la posición vive en umlView, nunca en UMLClass. Devuelve su id. */
    createUmlClass(opts: {
      name?: string
      x?: number
      y?: number
      id?: string
      visibility?: UMLVisibility
      isAbstract?: boolean
    } = {}): string | null {
      if (!this.ensureUmlModel()) return null
      const model = this.umlModel!
      const id = opts.id?.trim() || newUmlElementId()
      if (model.classifiers.some((c) => c.id === id)) return null
      const name = (opts.name ?? '').trim() || 'NuevaClase'

      const cls: UMLClass = {
        kind: 'class',
        id,
        name,
        visibility: opts.visibility ?? 'public',
        isAbstract: opts.isAbstract ?? false,
        attributes: [],
        operations: [],
        stereotypes: [],
      }
      model.classifiers.push(cls)

      this.umlView!.elements.push({
        id: `ve-${id}`,
        semanticElementId: id,
        x: Math.round(opts.x ?? 0),
        y: Math.round(opts.y ?? 0),
        width: 170,
        height: 70,
      })

      this.applyUmlModelToCanvas()
      return id
    },

    /** Elimina una clase del UMLModel y de la vista (también sus relaciones incidentes). */
    deleteUmlClass(classId: string): boolean {
      if (!this.ensureUmlModel()) return false
      const model = this.umlModel!
      const removedAssocIds = new Set<string>()
      for (const a of model.associations) {
        if (a.ends.some((e) => e.type.classifierId === classId)) removedAssocIds.add(a.id)
      }

      const before = model.classifiers.length
      model.classifiers = model.classifiers.filter((c) => c.id !== classId)
      if (model.classifiers.length === before) return false

      model.associations = model.associations.filter((a) => !removedAssocIds.has(a.id))
      model.generalizations = model.generalizations.filter((g) => g.specificId !== classId && g.generalId !== classId)
      model.dependencies = model.dependencies.filter((d) => d.clientId !== classId && d.supplierId !== classId)
      model.realizations = model.realizations.filter((r) => r.clientId !== classId && r.supplierId !== classId)
      model.associationClasses = model.associationClasses.filter(
        (ac) => ac.classId !== classId && !removedAssocIds.has(ac.associationId),
      )

      if (this.umlView) {
        this.umlView.elements = this.umlView.elements.filter((el) => el.semanticElementId !== classId)
        this.umlView.links = (this.umlView.links ?? []).filter(
          (l) => l.sourceElementId !== classId && l.targetElementId !== classId,
        )
      }

      this.applyUmlModelToCanvas()
      return true
    },

    /** Renombra una clase en el UMLModel. */
    renameUmlClass(classId: string, newName: string): boolean {
      if (!this.ensureUmlModel()) return false
      const cls = umlFindClass(this.umlModel!, classId)
      if (!cls) return false
      const name = (newName ?? '').trim()
      if (!name) return false
      cls.name = name
      this.applyUmlModelToCanvas()
      return true
    },

    /** Añade un atributo (UMLProperty) a una clase. Devuelve su id. */
    addUmlProperty(
      classId: string,
      data: {
        name: string
        type?: string | UMLTypeReference
        visibility?: UMLVisibility
        multiplicity?: string | UMLMultiplicity
        defaultValue?: string
        isStatic?: boolean
        isReadOnly?: boolean
        isDerived?: boolean
        isUnique?: boolean
        isOrdered?: boolean
        aggregation?: UMLAggregation
        isID?: boolean
        id?: string
      },
    ): string | null {
      if (!this.ensureUmlModel()) return null
      const cls = umlFindClass(this.umlModel!, classId)
      if (!cls) return null
      const id = data.id?.trim() || newUmlElementId()
      if (cls.attributes.some((p) => p.id === id)) return null

      const nameToId = umlClassifierNameToId(this.umlModel!)
      cls.attributes.push({
        id,
        name: (data.name ?? '').trim(),
        type: resolveUmlTypeReference(data.type, nameToId) ?? { kind: 'primitive', name: 'string' },
        visibility: data.visibility ?? 'public',
        multiplicity: normalizeUmlMultiplicity(data.multiplicity),
        isOrdered: data.isOrdered ?? false,
        isUnique: data.isUnique ?? true,
        isReadOnly: data.isReadOnly ?? false,
        isStatic: data.isStatic ?? false,
        isDerived: data.isDerived ?? false,
        defaultValue: data.defaultValue,
        aggregation: data.aggregation ?? 'none',
        isID: data.isID,
      })

      this.applyUmlModelToCanvas()
      return id
    },

    /** Modifica un atributo (UMLProperty) existente conservando su id. */
    updateUmlProperty(
      classId: string,
      propertyId: string,
      patch: {
        name?: string
        type?: string | UMLTypeReference | null
        visibility?: UMLVisibility
        multiplicity?: string | UMLMultiplicity
        defaultValue?: string | null
        isStatic?: boolean
        isReadOnly?: boolean
        isDerived?: boolean
        isUnique?: boolean
        isOrdered?: boolean
        aggregation?: UMLAggregation
        isID?: boolean
      },
    ): boolean {
      if (!this.ensureUmlModel()) return false
      const cls = umlFindClass(this.umlModel!, classId)
      if (!cls) return false
      const prop = cls.attributes.find((p) => p.id === propertyId)
      if (!prop) return false

      const nameToId = umlClassifierNameToId(this.umlModel!)
      if (patch.name != null) prop.name = patch.name.trim()
      if (patch.visibility != null) prop.visibility = patch.visibility
      if (patch.type != null) {
        const t = resolveUmlTypeReference(patch.type, nameToId)
        if (t) prop.type = t
      }
      if (patch.multiplicity != null) prop.multiplicity = normalizeUmlMultiplicity(patch.multiplicity)
      if ('defaultValue' in patch) prop.defaultValue = patch.defaultValue ?? undefined
      if (patch.isStatic != null) prop.isStatic = patch.isStatic
      if (patch.isReadOnly != null) prop.isReadOnly = patch.isReadOnly
      if (patch.isDerived != null) prop.isDerived = patch.isDerived
      if (patch.isUnique != null) prop.isUnique = patch.isUnique
      if (patch.isOrdered != null) prop.isOrdered = patch.isOrdered
      if (patch.aggregation != null) prop.aggregation = patch.aggregation
      if ('isID' in patch) prop.isID = patch.isID

      this.applyUmlModelToCanvas()
      return true
    },

    /** Elimina un atributo (UMLProperty) de una clase. */
    deleteUmlProperty(classId: string, propertyId: string): boolean {
      if (!this.ensureUmlModel()) return false
      const cls = umlFindClass(this.umlModel!, classId)
      if (!cls) return false
      const before = cls.attributes.length
      cls.attributes = cls.attributes.filter((p) => p.id !== propertyId)
      if (cls.attributes.length === before) return false
      this.applyUmlModelToCanvas()
      return true
    },

    /** Añade una operación (UMLOperation) con sus UMLParameter estructurados. Devuelve su id. */
    addUmlOperation(
      classId: string,
      data: {
        name: string
        visibility?: UMLVisibility
        parameters?: Array<{
          name?: string
          type?: string | UMLTypeReference
          direction?: UMLParameterDirection
          multiplicity?: string | UMLMultiplicity
          defaultValue?: string
          id?: string
        }>
        returnType?: string | UMLTypeReference
        isAbstract?: boolean
        isStatic?: boolean
        isQuery?: boolean
        id?: string
      },
    ): string | null {
      if (!this.ensureUmlModel()) return null
      const cls = umlFindClass(this.umlModel!, classId)
      if (!cls) return null
      const id = data.id?.trim() || newUmlElementId()
      if (cls.operations.some((o) => o.id === id)) return null

      const nameToId = umlClassifierNameToId(this.umlModel!)
      cls.operations.push({
        id,
        name: (data.name ?? '').trim(),
        visibility: data.visibility ?? 'public',
        parameters: (data.parameters ?? []).map((p) => ({
          id: p.id?.trim() || newUmlElementId(),
          name: (p.name ?? '').trim(),
          type: resolveUmlTypeReference(p.type, nameToId) ?? { kind: 'primitive', name: 'string' },
          direction: p.direction ?? 'in',
          multiplicity: normalizeUmlMultiplicity(p.multiplicity),
          defaultValue: p.defaultValue,
        })),
        returnType: resolveUmlTypeReference(data.returnType, nameToId),
        isAbstract: data.isAbstract ?? false,
        isStatic: data.isStatic ?? false,
        isQuery: data.isQuery,
      })

      this.applyUmlModelToCanvas()
      return id
    },

    /** Modifica una operación existente conservando ids (los parámetros se mapean por posición). */
    updateUmlOperation(
      classId: string,
      operationId: string,
      patch: {
        name?: string
        visibility?: UMLVisibility
        returnType?: string | UMLTypeReference | null
        isAbstract?: boolean
        isStatic?: boolean
        isQuery?: boolean
        parameters?: Array<{
          name?: string
          type?: string | UMLTypeReference
          direction?: UMLParameterDirection
          multiplicity?: string | UMLMultiplicity
          defaultValue?: string
          id?: string
        }>
      },
    ): boolean {
      if (!this.ensureUmlModel()) return false
      const cls = umlFindClass(this.umlModel!, classId)
      if (!cls) return false
      const op = cls.operations.find((o) => o.id === operationId)
      if (!op) return false

      const nameToId = umlClassifierNameToId(this.umlModel!)
      if (patch.name != null) op.name = patch.name.trim()
      if (patch.visibility != null) op.visibility = patch.visibility
      if ('returnType' in patch) {
        op.returnType = resolveUmlTypeReference(patch.returnType, nameToId)
      }
      if (patch.isAbstract != null) op.isAbstract = patch.isAbstract
      if (patch.isStatic != null) op.isStatic = patch.isStatic
      if (patch.isQuery !== undefined) op.isQuery = patch.isQuery
      if (patch.parameters != null) {
        op.parameters = patch.parameters.map((p, i) => ({
          id: p.id?.trim() || op.parameters[i]?.id || newUmlElementId(),
          name: (p.name ?? '').trim(),
          type: resolveUmlTypeReference(p.type, nameToId) ?? { kind: 'primitive', name: 'string' },
          direction: p.direction ?? 'in',
          multiplicity: normalizeUmlMultiplicity(p.multiplicity),
          defaultValue: p.defaultValue,
        }))
      }

      this.applyUmlModelToCanvas()
      return true
    },

    /** Elimina una operación (UMLOperation) de una clase. */
    deleteUmlOperation(classId: string, operationId: string): boolean {
      if (!this.ensureUmlModel()) return false
      const cls = umlFindClass(this.umlModel!, classId)
      if (!cls) return false
      const before = cls.operations.length
      cls.operations = cls.operations.filter((o) => o.id !== operationId)
      if (cls.operations.length === before) return false
      this.applyUmlModelToCanvas()
      return true
    },

    /**
     * Crea una relación en el modelo semántico (Association | Aggregation |
     * Composition | Generalization | Dependency) y su enlace visual.
     */
    createUmlRelationship(opts: {
      kind: UmlRelationshipKind
      sourceId: string
      targetId: string
      id?: string
      name?: string
      srcMultiplicity?: string | UMLMultiplicity
      tgtMultiplicity?: string | UMLMultiplicity
      anchorSrc?: UMLAnchor | null
      anchorTgt?: UMLAnchor | null
    }): string | null {
      if (!this.ensureUmlModel()) return null
      const model = this.umlModel!
      const src = (model.classifiers ?? []).find((c) => c.id === opts.sourceId)
      const tgt = (model.classifiers ?? []).find((c) => c.id === opts.targetId)
      if (!src || !tgt) return null

      const id = opts.id?.trim() || newUmlElementId()
      const relationAlready = (arr: Array<{ id: string }>) => arr.some((x) => x.id === id)
      if (
        relationAlready(model.associations) ||
        relationAlready(model.generalizations) ||
        relationAlready(model.dependencies) ||
        relationAlready(model.realizations)
      ) {
        return null
      }

      switch (opts.kind) {
        case 'Generalization': {
          if (src.id === tgt.id) return null
          model.generalizations.push({ id, specificId: src.id, generalId: tgt.id })
          break
        }
        case 'Dependency': {
          model.dependencies.push({ id, clientId: src.id, supplierId: tgt.id })
          break
        }
        case 'Association':
        case 'Aggregation':
        case 'Composition': {
          const srcAgg: UMLAssociationEnd['aggregation'] =
            opts.kind === 'Composition' ? 'composite' : opts.kind === 'Aggregation' ? 'shared' : 'none'
          model.associations.push({
            id,
            name: opts.name,
            ends: [
              {
                id: `end-${id}-src`,
                type: { kind: 'classifier', name: src.name, classifierId: src.id },
                multiplicity: normalizeUmlMultiplicity(opts.srcMultiplicity),
                isNavigable: false,
                isOrdered: false,
                isUnique: true,
                aggregation: srcAgg,
              },
              {
                id: `end-${id}-tgt`,
                type: { kind: 'classifier', name: tgt.name, classifierId: tgt.id },
                multiplicity: normalizeUmlMultiplicity(opts.tgtMultiplicity),
                isNavigable: false,
                isOrdered: false,
                isUnique: true,
                aggregation: 'none',
              },
            ],
          })
          break
        }
        default:
          return null
      }

      this.umlView!.links = this.umlView!.links ?? []
      this.umlView!.links.push({
        id: `vl-${id}`,
        semanticElementId: id,
        sourceElementId: src.id,
        targetElementId: tgt.id,
        anchorSrc: opts.anchorSrc ?? null,
        anchorTgt: opts.anchorTgt ?? null,
      })

      this.applyUmlModelToCanvas()
      return id
    },

    /** Elimina una relación del UMLModel y de la vista (conservando clases). */
    deleteUmlRelationship(relId: string): boolean {
      if (!this.ensureUmlModel()) return false
      const model = this.umlModel!
      let found = false

      const associations = model.associations.filter((a) => a.id !== relId)
      if (associations.length !== model.associations.length) found = true
      model.associations = associations

      const generalizations = model.generalizations.filter((g) => g.id !== relId)
      if (generalizations.length !== model.generalizations.length) found = true
      model.generalizations = generalizations

      const dependencies = model.dependencies.filter((d) => d.id !== relId)
      if (dependencies.length !== model.dependencies.length) found = true
      model.dependencies = dependencies

      const realizations = model.realizations.filter((r) => r.id !== relId)
      if (realizations.length !== model.realizations.length) found = true
      model.realizations = realizations

      model.associationClasses = model.associationClasses.filter((ac) => ac.associationId !== relId)
      if (this.umlView) {
        this.umlView.links = (this.umlView.links ?? []).filter((l) => l.semanticElementId !== relId)
      }

      if (!found) return false
      this.applyUmlModelToCanvas()
      return true
    },

    /* =========================
       REGISTRO DEL EMISOR RT
    ========================== */
    /** Llamar una vez desde el componente donde usas useSalaSocket */
    setRealtimeBroadcaster(fn?: () => void) {
      this.broadcastReplace = fn ?? null
    },

    /* =========================
       PERSISTENCIA LOCAL UMLPROJECT
    ========================== */
    async exportUmlProjectFile(): Promise<void> {
      try {
        if (!this.engine) throw new Error('Engine no inicializado')
        this.loadingExport = true

        const result = canvasSnapshotToUmlProjectDocument(this.engine.toJSON(), {
          documentId: this.umlModel?.id ?? 'uml-project',
          documentName: this.umlModel?.name ?? 'Diagrama de clases',
          modelId: this.umlModel?.id,
          viewId: this.umlView?.id,
          activeDiagramId: this.umlView?.id,
        })

        if (!result.modelValidation.valid || !result.viewValidation.valid) {
          throw new Error('El proyecto UML no es valido y no puede exportarse')
        }

        downloadUmlProjectDocument(result.document)
      } finally {
        this.loadingExport = false
      }
    },

    async importUmlProjectFile(file: File): Promise<void> {
      try {
        if (!this.engine) throw new Error('Engine no inicializado')
        this.loadingImport = true

        const result = await readUmlProjectDocumentFile(file)
        if (!result.document) {
          throw new Error(result.error ?? 'No se pudo cargar el proyecto UML')
        }

        if (!result.validation?.valid) {
          throw new Error('El proyecto UML cargado no es valido')
        }

        const canvasResult = umlProjectDocumentToCanvas(result.document)
        if (!canvasResult.model || !canvasResult.model.classes || !canvasResult.model.links) {
          throw new Error('El proyecto UML no pudo convertirse a Canvas')
        }

        this.engine.fromJSON(canvasResult.model)

        const activeView = result.document.diagrams.find((diagram) => diagram.id === result.document?.activeDiagramId)
          ?? result.document.diagrams[0]
          ?? null

        this.umlModel = result.document.model
        this.umlView = activeView
        this.umlWarnings = canvasResult.warnings

        this.setSelected(null, null)
        this.resetTool()

        try { this.broadcastReplace?.() } catch (e) { console.warn('broadcastReplace error', e) }
      } finally {
        this.loadingImport = false
      }
    },

    async importEnterpriseArchitectFile(file: File): Promise<void> {
      try {
        if (!this.engine) throw new Error('Engine no inicializado')
        this.loadingImport = true

        const result = importEnterpriseArchitectXmi(await file.text())
        if (!result.document) throw new Error(result.errors.join(' ') || 'No se pudo importar el XMI de Enterprise Architect')

        const canvasResult = umlProjectDocumentToCanvas(result.document)
        this.engine.fromJSON(canvasResult.model)
        const activeView = result.document.diagrams[0] ?? null

        this.umlModel = result.document.model
        this.umlView = activeView
        this.umlWarnings = [...result.warnings, ...canvasResult.warnings]
        this.setSelected(null, null)
        this.resetTool()

        try { this.broadcastReplace?.() } catch (e) { console.warn('broadcastReplace error', e) }
      } finally {
        this.loadingImport = false
      }
    },

    /* =========================
       EXPORTACIÓN SPRING BOOT
    ========================== */
    async exportSpringBoot(diagramaJson: object | undefined | null) {
      try {
        if (!diagramaJson) throw new Error('No hay diagrama para exportar')
        this.loadingExport = true
        await downloadSpringBootProject({
          projectName: 'demo-sources',
          includeDto: true,
          diagram: diagramaJson,
        })
      } catch (err) {
        console.error(err)
      } finally {
        this.loadingExport = false
      }
    },

        /* =========================
       EXPORTACIÓN FLUTTER
    ========================== */
    async exportFlutter(diagramaJson: object | undefined | null) {
      try {
        if (!diagramaJson) throw new Error('No hay diagrama para exportar')
        this.loadingExport = true
        await downloadFlutter({
          app_name: 'mi_flutter_app',
          api_base_url: 'http://localhost:8080',
          diagram: diagramaJson,
        })
      } catch (err) {
        console.error(err)
      } finally {
        this.loadingExport = false
      }
    },

    /* =========================
       ENVIAR EL PROMPT
    ========================== */
    async sendPrompt(prompt: string, opts?: { replace?: boolean }) {
      try {
        if (!this.engine) throw new Error('Engine no inicializado')
        this.loadingPrompt = true

        const current = this.engine.toExportJSONv2()
        const updated = await sendPrompt(prompt, current) // <-- ya es v2

        this.engine.fromExportJSONv2(updated, {
          replace: opts?.replace ?? true,
          autosize: true,
        })

        // 🔊 Reemplazo global en todas las sesiones conectadas
        try { this.broadcastReplace?.() } catch (e) { console.warn('broadcastReplace error', e) }

        this.setSelected(null, null)
        this.resetTool()
      } finally {
        this.loadingPrompt = false
      }
    },

    /* =========================
       IMPORTAR BOCETO (imagen → JSON → engine)
    ========================== */
    async importarBoceto(file: File, opts?: { mode?: 'append' | 'replace' }) {
      if (!file) return
      const mode = opts?.mode ?? 'append'
      this.loadingImport = true
      try {
        const v2 = await importarBocetoService({ file }) // <-- ya es v2

        if (!this.engine) throw new Error('Engine no inicializado')

        if (mode === 'append') {
          this.makeIdsUniqueAgainstCurrent(v2)
          this.offsetToRightOfCurrent(v2, 60)
        }

        this.engine.fromExportJSONv2(v2, {
          replace: mode === 'replace',
          autosize: true,
        })

        // 🔊 Reemplazo global en todas las sesiones conectadas
        try { this.broadcastReplace?.() } catch (e) { console.warn('broadcastReplace error', e) }

        this.setSelected(null, null)
        this.resetTool()
      } finally {
        this.loadingImport = false
      }
    },

    /** Detecta ExportDiagramModelV2 (classes{}, links{}) */
    isExportV2(obj: any): obj is { classes: Record<string, any>, links: Record<string, any> } {
      return !!obj
        && typeof obj === 'object'
        && obj.classes && typeof obj.classes === 'object' && !Array.isArray(obj.classes)
        && obj.links && typeof obj.links === 'object' && !Array.isArray(obj.links)
    },

    /** Desenvuelve payloads { success, data } y parsea ```json fences``` si vienen como string */
    unwrapDiagramPayload(raw: any): any {
      const candidate = raw?.data ?? raw
      if (typeof candidate === 'string') {
        // extrae JSON de ```json ... ```
        const m = /```json\s*([\s\S]*?)```/i.exec(candidate)
        if (m?.[1]) return JSON.parse(m[1])
        const i = candidate.indexOf('{'), j = candidate.lastIndexOf('}')
        if (i >= 0 && j > i) return JSON.parse(candidate.slice(i, j + 1))
        throw new Error('No se pudo extraer JSON válido del backend')
      }
      return candidate
    },

    /** Transforma la salida “simple” (arrays) a ExportDiagramModelV2 (records) */
    toExportV2FromSimple(simple: ImportedDiagramSimple | any) {
      const classesArr = Array.isArray(simple?.classes) ? simple.classes : []
      const relsArr = Array.isArray(simple?.relations) ? simple.relations : []

      const classes: Record<string, any> = {}
      for (const c of classesArr) {
        const id = c.id ?? crypto.randomUUID()
        classes[id] = {
          id,
          x: Math.round(c.x ?? 0),
          y: Math.round(c.y ?? 0),
          w: Math.round(c.w ?? 170),
          h: Math.round(c.h ?? 70),
          name: c.name ?? 'Tabla',
          attributes: Array.isArray(c.attributes)
            ? c.attributes.map((a: any) => ({
              name: a?.name ?? 'attr',
              type: a?.type ?? 'string',
              visibility: a?.visibility ?? a?.vis ?? undefined,
              default: a?.default ?? a?.initialValue ?? undefined,
              readonly: !!a?.readonly,
              static: !!a?.static,
              multiplicity: a?.multiplicity ?? undefined,
            }))
            : [],
          methods: Array.isArray(c.methods)
            ? c.methods.map((m: any) => ({
              name: m?.name ?? 'op',
              params: Array.isArray(m?.params)
                ? m.params.map((p: any) => ({
                  name: p?.name ?? 'p',
                  type: p?.type ?? undefined,
                  default: p?.default ?? p?.initialValue ?? undefined,
                }))
                : [],
              returnType: m?.returnType ?? m?.type ?? undefined,
              visibility: m?.visibility ?? m?.vis ?? undefined,
              static: !!m?.static,
              abstract: !!m?.abstract,
            }))
            : [],
        }
      }

      const links: Record<string, any> = {}
      const mapKind = (k: string): RelationKind | 'AssociateClass' => {
        const s = (k ?? '').toLowerCase()
        if (s.startsWith('assocclass') || s === 'associationclass') return 'AssociateClass'
        if (s.startsWith('assoc')) return 'Associate'
        if (s.startsWith('aggr')) return 'Aggregate'
        if (s.startsWith('comp')) return 'Compose'
        if (s.startsWith('gen') || s === 'inheritance') return 'Generalize'
        if (s.startsWith('dep')) return 'Dependency'
        return 'Associate'
      }

      // Mapa nombre → id (si relaciones vinieran con nombres en lugar de ids)
      const idByName = new Map<string, string>()
      for (const [id, c] of Object.entries(classes)) idByName.set((c as any).name, id)

      for (const r of relsArr) {
        const lid = r.id ?? crypto.randomUUID()
        const srcId = r.sourceId ?? idByName.get(r.from as string) ?? r.from
        const tgtId = r.targetId ?? idByName.get(r.to as string) ?? r.to
        links[lid] = {
          id: lid,
          kind: mapKind(String(r.kind)),
          sourceId: srcId,
          targetId: tgtId,
          labels: r.labels ?? {},
          assocClassId: r.assocClassId ?? undefined,
          anchorSrc: r.anchorSrc ?? null,
          anchorTgt: r.anchorTgt ?? null,
        }
      }

      return { classes, links } // ExportDiagramModelV2
    },

    /** Evita choque de IDs al hacer append (remapea y actualiza links) */
    makeIdsUniqueAgainstCurrent(v2: { classes: Record<string, any>; links: Record<string, any> }) {
      if (!this.engine) return
      const usedClassIds = new Set(Object.keys(this.engine.model.classes))
      const usedLinkIds = new Set(Object.keys(this.engine.model.links))

      const remap: Record<string, string> = {}

      // Clases
      for (const [id, c] of Object.entries(v2.classes)) {
        if (usedClassIds.has(id)) {
          const nid = crypto.randomUUID()
          remap[id] = nid
          c.id = nid
          v2.classes[nid] = c
          delete v2.classes[id]
        }
      }

      // Links
      for (const [id, l] of Object.entries(v2.links)) {
        if (usedLinkIds.has(id)) {
          const nid = crypto.randomUUID()
          l.id = nid
          v2.links[nid] = l
          delete v2.links[id]
        }
        if (remap[l.sourceId]) l.sourceId = remap[l.sourceId]
        if (remap[l.targetId]) l.targetId = remap[l.targetId]
        if (l.assocClassId && remap[l.assocClassId]) l.assocClassId = remap[l.assocClassId]
      }
    },

    /** Coloca el bloque importado a la derecha del diagrama actual (para no superponer) */
    offsetToRightOfCurrent(v2: { classes: Record<string, any> }, gap = 60) {
      if (!this.engine) return
      const nodes = Object.values(this.engine.model.classes)
      if (nodes.length === 0) return
      const maxX = Math.max(...nodes.map(n => n.x + n.w))
      const minY = Math.min(...nodes.map(n => n.y))

      const imported = Object.values(v2.classes)
      const minImportedX = Math.min(...imported.map((c: any) => c.x ?? 0))
      const minImportedY = Math.min(...imported.map((c: any) => c.y ?? 0))

      const dx = (maxX + gap) - (isFinite(minImportedX) ? minImportedX : 0)
      const dy = (minY) - (isFinite(minImportedY) ? minImportedY : 0)

      for (const c of imported) {
        c.x = Math.round((c.x ?? 0) + dx)
        c.y = Math.round((c.y ?? 0) + dy)
      }
    },

    /* =========================
       SELECCIÓN / HERRAMIENTAS
    ========================== */
    setEngine(e: CanvasEngine) {
      this.engine = e
      this.umlModel = null
      this.umlView = null
      this.umlWarnings = []
    },
    setSelected(kind: null | 'class' | 'link', id: string | null) {
      this.selected.kind = kind
      this.selected.id = id
      if (!this.engine) return
      if (kind === 'class') this.engine.setSelectionClass(id)
      else if (kind === 'link') this.engine.setSelectionLink(id)
      else this.engine.clearSelection()
    },
    setSelectedClass(id: string | null) { this.setSelected(id ? 'class' : null, id) },
    setSelectedLink(id: string | null) { this.setSelected(id ? 'link' : null, id) },
    setSelectedById(id: string | null) {
      if (!this.engine || !id) return this.setSelected(null, null)
      if (this.engine.model.classes[id]) this.setSelected('class', id)
      else if (this.engine.model.links[id]) this.setSelected('link', id)
      else this.setSelected(null, null)
    },

    setTool(t: Tool) { this.tool = t },
    resetTool() { this.tool = 'select'; this.firstForLink = null },
    setFirstForLink(id: string | null) { this.firstForLink = id },
    setRelationKind(k: RelationKind) { this.relationKind = k },
    setAssociationClassMode() { this.relationKind = 'Associate'; this.tool = 'add-assoc-class'; this.firstForLink = null },
  },
})
