// src/services/canvas.engine.ts
import { reactive } from 'vue'
import { parseAttrLineWithVis, parseMethodLineWithVis } from '@/modules/editor/utils/uml-classic'
import type { UMLAttr, UMLMethod } from '@/modules/editor/types/uml-classic'

const SELF_LOOP_GAP = 28
const SELF_LOOP_PAD = 12

const HANDLE_R = 5                 // radio visual del handle
const HANDLE_HIT = 9               // tolerancia de hit-test sobre el handle

export type RelationKind = 'Associate' | 'Aggregate' | 'Compose' | 'Generalize' | 'Dependency'

export interface ClassNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  name: string
  attributes: string[]
  methods: string[]
}

export interface LinkLabels { name?: string; src?: string; tgt?: string }

type Side = 'L' | 'R' | 'T' | 'B'
export type Anchor = { side: Side; t: number }   // t ∈ [0..1] a lo largo del lado

// distancia de escape fuera del borde de la clase antes de hacer el primer codo
const EXIT_GAP = 14
function offsetForSide(side: Side) {
  if (side === 'L') return { dx: -EXIT_GAP, dy: 0 }
  if (side === 'R') return { dx: EXIT_GAP, dy: 0 }
  if (side === 'T') return { dx: 0, dy: -EXIT_GAP }
  return { dx: 0, dy: EXIT_GAP } // 'B'
}

export interface LinkEdge {
  id: string
  kind: RelationKind
  sourceId: string
  targetId: string
  labels?: LinkLabels
  /** si existe, este enlace tiene una clase asociativa conectada con línea discontinua */
  assocClassId?: string
  /** ancla manual en el borde de la clase (extremo source/target) */
  anchorSrc?: Anchor | null
  anchorTgt?: Anchor | null
}

export interface DiagramModel {
  classes: Record<string, ClassNode>
  links: Record<string, LinkEdge>
}

/* ===== Tipos SOLO para exportación ===== */
export type ExportRelationKind = RelationKind | 'AssociateClass'
export type ExportLinkEdge = Omit<LinkEdge, 'kind'> & { kind: ExportRelationKind }

export interface ExportLinkV2 extends Omit<LinkEdge, 'kind'> { kind: ExportRelationKind }
export interface ExportClassV2 {
  id: string
  x: number
  y: number
  w: number
  h: number
  name: string
  attributes: UMLAttr[]
  methods: UMLMethod[]
}
export interface ExportDiagramModelV2 {
  classes: Record<string, ExportClassV2>
  links: Record<string, ExportLinkV2>
}

export interface ExportDiagramModel {
  classes: Record<string, ClassNode>
  links: Record<string, ExportLinkEdge>
}

export type Hit =
  | { type: 'class'; id: string }
  | { type: 'link'; id: string }
  | { type: 'blank' }

// === helpers de formateo (v2 -> líneas de texto) ==========================
type AnyObj = Record<string, any>;

function mapVisSymbol(v?: string) {
  if (!v) return '';
  const s = String(v).trim();
  if (['+', '-', '#', '~'].includes(s)) return s;
  const map: AnyObj = { public: '+', private: '-', protected: '#', package: '~', default: '' };
  return map[s] ?? '';
}

/** <<< NUEVO: normalizadores para limpiar datos entrantes >>> */
function normalizeAttrForImport(a: AnyObj): AnyObj {
  let name = String(a?.name ?? '').trim()
  let vis: string | undefined = a?.visibility ?? a?.vis

  // Si el nombre viene con vis al inicio (ej: "+nombre" o "++nombre")
  const m = name.match(/^([+\-#~]+)\s*/)
  if (m) {
    if (!vis) vis = m[1][0] // toma solo un símbolo
    name = name.slice(m[0].length).trim()
  }

  // Si el name trae ": tipo" embebido y no hay type
  if (!a?.type && name.includes(':')) {
    const [nm, ty] = name.split(':')
    name = nm.trim()
    const tclean = String(ty ?? '').trim()
    if (tclean) a.type = tclean
  }

  // Normaliza vis a un solo símbolo válido
  const visSym = mapVisSymbol(vis)

  return {
    ...a,
    name,
    vis: visSym || undefined,
    visibility: undefined
  }
}

function normalizeMethodForImport(m: AnyObj): AnyObj {
  let name = String(m?.name ?? '').trim()
  let vis: string | undefined = m?.visibility ?? m?.vis

  // Visibilidad pegada al nombre (ej: "+metodo")
  const x = name.match(/^([+\-#~]+)\s*/)
  if (x) {
    if (!vis) vis = x[1][0]
    name = name.slice(x[0].length).trim()
  }

  const visSym = mapVisSymbol(vis)

  return {
    ...m,
    name,
    vis: visSym || undefined,
    visibility: undefined
  }
}

function formatAttrLine(a: AnyObj): string {
  const visSym = mapVisSymbol(a.visibility ?? a.vis)
  const vis = visSym ? `${visSym} ` : ''   // <-- espacio después del símbolo
  const nm = a.name ?? 'attr'
  const ty = a.type ? `: ${a.type}` : ''
  const mult = a.multiplicity ? ` [${a.multiplicity}]` : ''
  const ro = a.readonly ? ' {readOnly}' : ''
  const st = a.static ? ' {static}' : ''
  const def = (a.default ?? a.initialValue) != null ? ` = ${a.default ?? a.initialValue}` : ''
  return `${vis}${nm}${ty}${mult}${def}${ro}${st}`.trim()
}
function formatParam(p: AnyObj): string {
  // admite "name, type, default"
  const nm = p.name ?? 'p'
  const ty = p.type ? `: ${p.type}` : ''
  const def = (p.default ?? p.initialValue) != null ? ` = ${p.default ?? p.initialValue}` : ''
  return `${nm}${ty}${def}`
}

function formatMethodLine(m: AnyObj): string {
  const visSym = mapVisSymbol(m.visibility ?? m.vis)
  const vis = visSym ? `${visSym} ` : ''   // <-- espacio después del símbolo
  const nm = m.name ?? 'op'
  const params = Array.isArray(m.params) ? m.params.map(formatParam).join(', ') : ''
  const ret = (m.returnType ?? m.type) ? `: ${m.returnType ?? m.type}` : ''
  const st = m.static ? ' {static}' : ''
  const ab = m.abstract ? ' {abstract}' : ''
  return `${vis}${nm}(${params})${ret}${st}${ab}`.trim()
}
// === IMPORTADOR: ExportDiagramModelV2 -> DiagramModel interno =============
export interface ImportOptions {
  /** Si true, ejecuta autoSize() en cada clase importada (por defecto: true) */
  autosize?: boolean
  /** Si true, limpia el modelo actual antes de importar (por defecto: true) */
  replace?: boolean
}
// =============== helpers ===============
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)) }
function mid(a: number, b: number) { return (a + b) / 2 }
function snap(v: number) { return Math.round(v) + 0.5 }

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1
  const dot = A * C + B * D, len = C * C + D * D
  const t = len ? Math.max(0, Math.min(1, dot / len)) : 0
  const xx = x1 + t * C, yy = y1 + t * D
  const dx = px - xx, dy = py - yy
  return Math.sqrt(dx * dx + dy * dy)
}
function distToPolyline(px: number, py: number, pts: { x: number, y: number }[]) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    best = Math.min(best, distPointToSegment(px, py, a.x, a.y, b.x, b.y))
  }
  return best
}

type Port = { x: number; y: number; side: Side }
function rectPorts(n: ClassNode): Record<Side, Port> {
  return {
    L: { x: n.x, y: n.y + n.h / 2, side: 'L' },
    R: { x: n.x + n.w, y: n.y + n.h / 2, side: 'R' },
    T: { x: n.x + n.w / 2, y: n.y, side: 'T' },
    B: { x: n.x + n.w / 2, y: n.y + n.h, side: 'B' }
  }
}
function chooseSides(a: ClassNode, b: ClassNode): { src: Port; tgt: Port; mode: 'H' | 'V' | 'S' } {
  const pa = rectPorts(a)
  if (a.id === b.id) return { src: pa.R, tgt: pa.T, mode: 'S' }
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2)
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2)
  const pb = rectPorts(b)
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { src: dx >= 0 ? pa.R : pa.L, tgt: dx >= 0 ? pb.L : pb.R, mode: 'H' }
  } else {
    return { src: dy >= 0 ? pa.B : pa.T, tgt: dy >= 0 ? pb.T : pb.B, mode: 'V' }
  }
}

const FAN_SPACING = 12
const FAN_MARGIN = 10
function sideAttachPoint(
  n: ClassNode,
  side: Side,
  slotIndex: number,
  total: number,
  spacing = FAN_SPACING
) {
  const offset = (slotIndex - (total - 1) / 2) * spacing
  const minX = n.x + FAN_MARGIN, maxX = n.x + n.w - FAN_MARGIN
  const minY = n.y + FAN_MARGIN, maxY = n.y + n.h - FAN_MARGIN
  if (side === 'L') return { x: n.x, y: clamp(n.y + n.h / 2 + offset, minY, maxY) }
  if (side === 'R') return { x: n.x + n.w, y: clamp(n.y + n.h / 2 + offset, minY, maxY) }
  if (side === 'T') return { x: clamp(n.x + n.w / 2 + offset, minX, maxX), y: n.y }
  /* side === 'B' */ return { x: clamp(n.x + n.w / 2 + offset, minX, maxX), y: n.y + n.h }
}

/** Punto exacto sobre el borde según ancla (side+t) */
function anchorPoint(n: ClassNode, a: Anchor) {
  const t = clamp(a.t, 0, 1)
  if (a.side === 'L') return { x: n.x, y: n.y + n.h * t }
  if (a.side === 'R') return { x: n.x + n.w, y: n.y + n.h * t }
  if (a.side === 'T') return { x: n.x + n.w * t, y: n.y }
  /* 'B' */        return { x: n.x + n.w * t, y: n.y + n.h }
}

/** Coloca multiplicidad al costado correcto */
function drawLabelAtSide(
  ctx: CanvasRenderingContext2D,
  text: string | undefined,
  x: number,
  y: number,
  side: Side
) {
  if (!text) return
  const PAD = 10
  const SHIFT = 8
  if (side === 'L') {
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(text, x - PAD, y - SHIFT)
  } else if (side === 'R') {
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(text, x + PAD, y - SHIFT)
  } else if (side === 'T') {
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(text, x + SHIFT, y - PAD)
  } else { // 'B'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(text, x + SHIFT, y + PAD)
  }
}

// ======== Engine =========
export class CanvasEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private needsRedraw = true

  private view = { scale: 1, tx: 0, ty: 0, min: 0.25, max: 4 }

  model: DiagramModel
  selection = reactive<{ id: string | null; kind: 'class' | 'link' | null }>({ id: null, kind: null })

  private font = { header: 'bold 13px ui-sans-serif, system-ui', text: '12px ui-sans-serif, system-ui' }
  private lineH = 16

  private fanIndexSrc = new Map<string, string[]>()
  private fanIndexTgt = new Map<string, string[]>()
  private fanSpacingSrc = new Map<string, number>()
  private fanSpacingTgt = new Map<string, number>()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context no disponible')
    this.ctx = ctx
    this.model = reactive<DiagramModel>({ classes: {}, links: {} })
    this.loop()
  }

  // ---------- API ----------
  requestDraw() { this.needsRedraw = true }

  setViewport(scale: number, tx: number, ty: number) {
    this.view.scale = clamp(scale, this.view.min, this.view.max)
    this.view.tx = tx; this.view.ty = ty
    this.requestDraw()
  }
  getViewport() { return { ...this.view } }
  screenToWorld(x: number, y: number) { return { x: (x - this.view.tx) / this.view.scale, y: (y - this.view.ty) / this.view.scale } }
  worldToScreen(x: number, y: number) { return { x: x * this.view.scale + this.view.tx, y: y * this.view.scale + this.view.ty } }
  panBy(dx: number, dy: number) { this.view.tx += dx; this.view.ty += dy; this.requestDraw() }
  zoomAtScreenPoint(sx: number, sy: number, factor: number) {
    const old = this.view.scale
    const next = clamp(old * factor, this.view.min, this.view.max)
    if (next === old) return
    const wx = (sx - this.view.tx) / old
    const wy = (sy - this.view.ty) / old
    this.view.tx = sx - wx * next
    this.view.ty = sy - wy * next
    this.view.scale = next
    this.requestDraw()
  }

  addClass(x: number, y: number, name = 'Tabla', id?: string) {
    const nid = id || (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const node: ClassNode = { id: nid, x, y, w: 170, h: 70, name, attributes: [], methods: [] }
    this.model.classes[nid] = node
    this.autoSize(node); this.requestDraw()
    return nid
  }
  setClassPosition(id: string, x: number, y: number) {
    const n = this.model.classes[id]; if (!n) return
    n.x = Math.round(x); n.y = Math.round(y)
    this.requestDraw()
  }
  updateClass(id: string, p: Partial<Pick<ClassNode, 'name' | 'attributes' | 'methods' | 'w' | 'h'>>) {
    const n = this.model.classes[id]; if (!n) return
    if (p.name != null) n.name = p.name
    if (p.attributes != null) n.attributes = p.attributes
    if (p.methods != null) n.methods = p.methods
    if (p.w != null) n.w = p.w
    if (p.h != null) n.h = p.h
    this.autoSize(n); this.requestDraw()
  }
  deleteClass(id: string) {
    delete this.model.classes[id]
    for (const l of Object.values(this.model.links)) {
      if (l.sourceId === id || l.targetId === id) delete this.model.links[l.id]
    }
    for (const l of Object.values(this.model.links)) {
      if (l.assocClassId === id) delete l.assocClassId
    }
    if (this.selection.id === id) this.clearSelection()
    this.requestDraw()
  }

  addLink(kind: RelationKind, sourceId: string, targetId: string, id?: string) {
    const lid = id || (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    this.model.links[lid] = { id: lid, kind, sourceId, targetId, labels: {}, anchorSrc: null, anchorTgt: null }
    this.requestDraw(); return lid
  }
  updateLink(id: string, p: Partial<LinkEdge> & { labels?: LinkLabels }) {
    const l = this.model.links[id]; if (!l) return
    if (p.kind) l.kind = p.kind
    if (p.sourceId) { l.sourceId = p.sourceId; if (p.anchorSrc === undefined) l.anchorSrc = null } // cambio de nodo => limpiar ancla si no la pasan
    if (p.targetId) { l.targetId = p.targetId; if (p.anchorTgt === undefined) l.anchorTgt = null }
    if (p.labels) l.labels = { ...(l.labels ?? {}), ...p.labels }
    if (p.assocClassId !== undefined) l.assocClassId = p.assocClassId
    if ('anchorSrc' in p) l.anchorSrc = p.anchorSrc ?? null
    if ('anchorTgt' in p) l.anchorTgt = p.anchorTgt ?? null
    this.requestDraw()
  }
  deleteLink(id: string) {
    delete this.model.links[id]
    if (this.selection.id === id) this.clearSelection()
    this.requestDraw()
  }

  // ====== API: Clase asociativa ======
  addAssociationClassBetween(sourceId: string, targetId: string, name = 'Asociativa') {
    const linkId = this.addLink('Associate', sourceId, targetId)
    const link = this.model.links[linkId]
    const pm = this.polyMid(this.getPolyline(link))
    const clsId = this.addClass(pm.x + 24, pm.y - 24, name)
    link.assocClassId = clsId
    this.requestDraw()
    return { linkId, clsId }
  }
  addAssociationClassOnLink(linkId: string, name = 'Asociativa') {
    const l = this.model.links[linkId]
    if (!l) return
    if (l.assocClassId && this.model.classes[l.assocClassId]) return l.assocClassId
    const pm = this.polyMid(this.getPolyline(l))
    const clsId = this.addClass(pm.x + 24, pm.y - 24, name)
    l.assocClassId = clsId
    this.requestDraw()
    return clsId
  }

  setSelectionClass(id: string | null) { this.selection.id = id; this.selection.kind = id ? 'class' : null; this.requestDraw() }
  setSelectionLink(id: string | null) { this.selection.id = id; this.selection.kind = id ? 'link' : null; this.requestDraw() }
  clearSelection() { this.selection.id = null; this.selection.kind = null; this.requestDraw() }

  toExportJSON(): ExportDiagramModel {
    const outLinks: Record<string, ExportLinkEdge> = {}
    for (const l of Object.values(this.model.links)) {
      const kind: ExportRelationKind = l.assocClassId ? 'AssociateClass' : l.kind
      outLinks[l.id] = { ...l, kind }
    }
    return { classes: { ...this.model.classes }, links: outLinks }
  }

  toExportJSONv2(): ExportDiagramModelV2 {
    const outLinks: Record<string, ExportLinkV2> = {}
    for (const l of Object.values(this.model.links)) {
      const kind: ExportRelationKind = l.assocClassId ? 'AssociateClass' : l.kind
      outLinks[l.id] = { ...l, kind }
    }
    const outClasses: Record<string, ExportClassV2> = {}
    for (const [id, c] of Object.entries(this.model.classes)) {
      const attrs: UMLAttr[] = (c.attributes || []).map(parseAttrLineWithVis)
      const methods: UMLMethod[] = (c.methods || []).map(parseMethodLineWithVis)
      outClasses[id] = { id: c.id, x: c.x, y: c.y, w: c.w, h: c.h, name: c.name, attributes: attrs, methods }
    }
    return { classes: outClasses, links: outLinks }
  }

  toJSON(): DiagramModel { return { classes: { ...this.model.classes }, links: { ...this.model.links } } }
  fromJSON(raw?: unknown) {
    const ok = raw && typeof raw === 'object' && 'classes' in (raw as any) && 'links' in (raw as any)
    const m = ok ? (raw as any) : { classes: {}, links: {} }
    const normalized: Record<string, LinkEdge> = {}
    for (const [id, l] of Object.entries(m.links || {})) {
      const k = (l as any).kind === 'AssociateClass' ? 'Associate' : (l as any).kind
      normalized[id] = { ...(l as any), kind: k }
    }
    ; (this.model as any).classes = m.classes ?? {}
      ; (this.model as any).links = normalized
    this.requestDraw()
  }

  // ---------- render loop ----------
  private loop = () => { if (this.needsRedraw) { this.draw(); this.needsRedraw = false }; requestAnimationFrame(this.loop) }

  private draw() {
    const ctx = this.ctx
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.restore()

    ctx.save()
    const W = this.canvas.clientWidth || this.canvas.width
    const H = this.canvas.clientHeight || this.canvas.height
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)

    this.buildFanIndices()

    ctx.save()
    ctx.translate(this.view.tx, this.view.ty)
    ctx.scale(this.view.scale, this.view.scale)

    for (const l of Object.values(this.model?.links ?? {})) this.drawLink(l)
    for (const n of Object.values(this.model?.classes ?? {})) this.drawClass(n)

    ctx.restore()
    ctx.restore()
  }

  // ===== fan index global =====
  private buildFanIndices() {
    this.fanIndexSrc.clear()
    this.fanIndexTgt.clear()
    this.fanSpacingSrc.clear()
    this.fanSpacingTgt.clear()

    type Bucket = { node: ClassNode; side: Side; items: { id: string; otherCenter: number; label?: string }[] }
    const bucketsSrc = new Map<string, Bucket>()
    const bucketsTgt = new Map<string, Bucket>()

    for (const l of Object.values(this.model.links)) {
      const a = this.model.classes[l.sourceId], b = this.model.classes[l.targetId]
      if (!a || !b) continue

      const ch = chooseSides(a, b)
      const srcSide: Side = l.anchorSrc?.side ?? ch.src.side
      const tgtSide: Side = l.anchorTgt?.side ?? ch.tgt.side

      const srcKey = `${a.id}|${srcSide}`
      const tgtKey = `${b.id}|${tgtSide}`

      const otherSrc = (srcSide === 'L' || srcSide === 'R') ? (b.y + b.h / 2) : (b.x + b.w / 2)
      const otherTgt = (tgtSide === 'L' || tgtSide === 'R') ? (a.y + a.h / 2) : (a.x + a.w / 2)

      if (!bucketsSrc.has(srcKey)) bucketsSrc.set(srcKey, { node: a, side: srcSide, items: [] })
      if (!bucketsTgt.has(tgtKey)) bucketsTgt.set(tgtKey, { node: b, side: tgtSide, items: [] })
      bucketsSrc.get(srcKey)!.items.push({ id: l.id, otherCenter: otherSrc, label: l.labels?.src })
      bucketsTgt.get(tgtKey)!.items.push({ id: l.id, otherCenter: otherTgt, label: l.labels?.tgt })
    }

    const finalize = (mapIdx: Map<string, string[]>, mapSp: Map<string, number>, buckets: Map<string, Bucket>) => {
      for (const [key, b] of buckets) {
        b.items.sort((i1, i2) => (i1.otherCenter - i2.otherCenter) || (i1.id < i2.id ? -1 : 1))
        mapIdx.set(key, b.items.map(i => i.id))
        mapSp.set(key, FAN_SPACING)
      }
    }
    finalize(this.fanIndexSrc, this.fanSpacingSrc, bucketsSrc)
    finalize(this.fanIndexTgt, this.fanSpacingTgt, bucketsTgt)
  }

  private getFanSlot(nodeId: string, side: Side, linkId: string, asSource: boolean) {
    const map = asSource ? this.fanIndexSrc : this.fanIndexTgt
    const key = `${nodeId}|${side}`
    const arr = map.get(key) ?? []
    const index = Math.max(0, arr.indexOf(linkId))
    return { index, total: arr.length || 1 }
  }

  // ======= geometry =======
  private getPolyline(l: LinkEdge) {
    const a = this.model.classes[l.sourceId], b = this.model.classes[l.targetId]
    const ch = chooseSides(a, b)

    // self-loop: usa la rutina especial
    if (a.id === b.id) return this.getSelfLoopPolyline(l, a, ch)

    const srcSide = (l.anchorSrc?.side ?? ch.src.side) as Side
    const tgtSide = (l.anchorTgt?.side ?? ch.tgt.side) as Side

    const srcSlot = this.getFanSlot(a.id, srcSide, l.id, true)
    const tgtSlot = this.getFanSlot(b.id, tgtSide, l.id, false)

    const spacingSrc = this.fanSpacingSrc.get(`${a.id}|${srcSide}`) ?? FAN_SPACING
    const spacingTgt = this.fanSpacingTgt.get(`${b.id}|${tgtSide}`) ?? FAN_SPACING

    // puntos exactos sobre el borde (respetan anchors si existen)
    const p0 = l.anchorSrc
      ? anchorPoint(a, l.anchorSrc)
      : sideAttachPoint(a, srcSide, srcSlot.index, srcSlot.total, spacingSrc)

    const pN = l.anchorTgt
      ? anchorPoint(b, l.anchorTgt)
      : sideAttachPoint(b, tgtSide, tgtSlot.index, tgtSlot.total, spacingTgt)

    // puntos de "escape"
    const off0 = offsetForSide(srcSide)
    const offN = offsetForSide(tgtSide)
    const e0 = { x: snap(p0.x + off0.dx), y: snap(p0.y + off0.dy) }
    const eN = { x: snap(pN.x + offN.dx), y: snap(pN.y + offN.dy) }

    const pts: { x: number; y: number }[] = [{ x: snap(p0.x), y: snap(p0.y) }]

    const srcLR = srcSide === 'L' || srcSide === 'R'
    const tgtLR = tgtSide === 'L' || tgtSide === 'R'

    // Router ortogonal
    if (srcLR && tgtLR) {
      const yMid = snap(mid(e0.y, eN.y))
      pts.push(e0, { x: e0.x, y: yMid }, { x: eN.x, y: yMid }, eN)
    } else if (!srcLR && !tgtLR) {
      const xMid = snap(mid(e0.x, eN.x))
      pts.push(e0, { x: xMid, y: e0.y }, { x: xMid, y: eN.y }, eN)
    } else if (srcLR && !tgtLR) {
      pts.push(e0, { x: eN.x, y: e0.y }, eN)
    } else {
      pts.push(e0, { x: e0.x, y: eN.y }, eN)
    }

    // último tramo
    pts.push({ x: snap(pN.x), y: snap(pN.y) })
    return pts
  }

  private getSelfLoopPolyline(
    l: LinkEdge,
    n: ClassNode,
    ch: { src: Port; tgt: Port; mode: 'H' | 'V' | 'S' }
  ) {
    const srcSide = (l.anchorSrc?.side ?? ch.src.side) as Side
    const tgtSide = (l.anchorTgt?.side ?? ch.tgt.side) as Side

    const srcSlot = this.getFanSlot(n.id, srcSide, l.id, true)
    const tgtSlot = this.getFanSlot(n.id, tgtSide, l.id, false)

    const p0 = l.anchorSrc
      ? anchorPoint(n, l.anchorSrc)
      : sideAttachPoint(
        n,
        srcSide,
        srcSlot.index,
        srcSlot.total,
        this.fanSpacingSrc.get(`${n.id}|${srcSide}`) ?? FAN_SPACING
      )

    const pN = l.anchorTgt
      ? anchorPoint(n, l.anchorTgt)
      : sideAttachPoint(
        n,
        tgtSide,
        tgtSlot.index,
        tgtSlot.total,
        this.fanSpacingTgt.get(`${n.id}|${tgtSide}`) ?? FAN_SPACING
      )

    // separación del loop
    const slotSpread = Math.max(srcSlot.index, tgtSlot.index)
    const gap = SELF_LOOP_GAP + slotSpread * SELF_LOOP_PAD

    // puntos de “escape” fuera de la caja
    const off0 = offsetForSide(srcSide)
    const offN = offsetForSide(tgtSide)
    const e0 = { x: snap(p0.x + off0.dx), y: snap(p0.y + off0.dy) }
    const eN = { x: snap(pN.x + offN.dx), y: snap(pN.y + offN.dy) }

    // rectángulo exterior alrededor de la clase
    const xL = snap(n.x - gap)
    const xR = snap(n.x + n.w + gap)
    const yT = snap(n.y - gap)
    const yB = snap(n.y + n.h + gap)

    const pts: { x: number; y: number }[] = [{ x: snap(p0.x), y: snap(p0.y) }, e0]
    const goX = (x: number) => pts.push({ x: snap(x), y: pts[pts.length - 1].y })
    const goY = (y: number) => pts.push({ x: pts[pts.length - 1].x, y: snap(y) })

    // ruta ortogonal por el “rectángulo exterior”
    switch (`${srcSide}-${tgtSide}`) {
      case 'R-T': goX(xR); goY(yT); goX(eN.x); break
      case 'R-B': goX(xR); goY(yB); goX(eN.x); break
      case 'L-T': goX(xL); goY(yT); goX(eN.x); break
      case 'L-B': goX(xL); goY(yB); goX(eN.x); break
      case 'T-R': goY(yT); goX(xR); goY(eN.y); break
      case 'B-R': goY(yB); goX(xR); goY(eN.y); break
      case 'T-L': goY(yT); goX(xL); goY(eN.y); break
      case 'B-L': goY(yB); goX(xL); goY(eN.y); break
      default: {
        // mismo lado (R-R, L-L, T-T, B-B) -> rodea una esquina
        if (srcSide === 'R') { goX(xR); goY(yT); goX(eN.x) }
        else if (srcSide === 'L') { goX(xL); goY(yT); goX(eN.x) }
        else if (srcSide === 'T') { goY(yT); goX(xR); goY(eN.y) }
        else { /* 'B' */        goY(yB); goX(xR); goY(eN.y) }
        break
      }
    }

    // entrada desde fuera y punto final en el borde
    pts.push(eN)
    pts.push({ x: snap(pN.x), y: snap(pN.y) })

    return pts
  }

  private polyMid(pts: { x: number, y: number }[]) {
    const i = Math.floor((pts.length - 1) / 2)
    const a = pts[i], b = pts[i + 1] ?? a
    return { x: mid(a.x, b.x), y: mid(a.y, b.y) }
  }

  // ===== draw =====
  private autoSize(n: ClassNode) {
    const padX = 12, padY = 10, headerH = 24
    const lines = Math.max(1, n.attributes.length) + Math.max(1, n.methods.length)
    n.h = headerH + padY + lines * this.lineH + padY
    const ctx = this.ctx
    ctx.font = this.font.header
    let w = ctx.measureText(n.name || 'Tabla').width + padX * 2
    ctx.font = this.font.text
    for (const t of [...n.attributes, ...n.methods]) w = Math.max(w, ctx.measureText(t || '—').width + padX * 2)
    n.w = Math.max(170, Math.ceil(w))
  }

  private drawClass(n: ClassNode) {
    const ctx = this.ctx
    const sel = this.selection.kind === 'class' && this.selection.id === n.id

    ctx.save()

    ctx.lineWidth = 1
    ctx.strokeStyle = sel ? '#2b6cb0' : '#d0d7de'
    ctx.fillStyle = '#fff'
    this.roundRect(ctx, snap(n.x), snap(n.y), n.w, n.h, 8); ctx.fill(); ctx.stroke()

    ctx.beginPath(); ctx.moveTo(snap(n.x), snap(n.y + 24)); ctx.lineTo(snap(n.x + n.w), snap(n.y + 24))
    ctx.strokeStyle = '#e5e7eb'; ctx.stroke()

    const yAttrsStart = n.y + 24
    const yMethStart = yAttrsStart + Math.max(1, n.attributes.length) * this.lineH + 8
    ctx.beginPath(); ctx.moveTo(snap(n.x), snap(yMethStart)); ctx.lineTo(snap(n.x + n.w), snap(yMethStart))
    ctx.strokeStyle = '#f1f5f9'; ctx.stroke()

    ctx.fillStyle = '#111827'
    ctx.font = this.font.header
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(n.name || 'Tabla', n.x + 10, n.y + 6)

    ctx.font = this.font.text
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    let y = yAttrsStart + 8
    if (n.attributes.length === 0) { ctx.fillStyle = '#9ca3af'; ctx.fillText('—', n.x + 10, y) }
    else { ctx.fillStyle = '#111827'; for (const a of n.attributes) { ctx.fillText(a, n.x + 10, y); y += this.lineH } }

    y = yMethStart + 8
    if (n.methods.length === 0) { ctx.fillStyle = '#9ca3af'; ctx.fillText('—', n.x + 10, y) }
    else { ctx.fillStyle = '#111827'; for (const m of n.methods) { ctx.fillText(m, n.x + 10, y); y += this.lineH } }

    ctx.restore()
  }

  private drawOpenArrowHead(x: number, y: number, fromX: number, fromY: number) {
    const ctx = this.ctx
    const angle = Math.atan2(y - fromY, x - fromX)
    const size = 9
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-size, size * 0.6)
    ctx.moveTo(0, 0)
    ctx.lineTo(-size, -size * 0.6)
    ctx.strokeStyle = '#6b7280'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  private drawHandle(x: number, y: number, selected: boolean) {
    const ctx = this.ctx
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2)
    ctx.fillStyle = selected ? '#2b6cb0' : '#94a3b8'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  private drawLink(l: LinkEdge) {
    const a = this.model.classes[l.sourceId], b = this.model.classes[l.targetId]
    if (!a || !b) return
    const ctx = this.ctx
    const sel = this.selection.kind === 'link' && this.selection.id === l.id

    const pts = this.getPolyline(l)

    // trazo principal
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)

    ctx.lineWidth = 1
    ctx.strokeStyle = sel ? '#2b6cb0' : '#6b7280'
    if (l.kind === 'Dependency') {
      ctx.setLineDash([6, 4])
      ctx.lineCap = 'butt'
      ctx.lineJoin = 'miter'
    } else {
      ctx.setLineDash([])
    }
    ctx.stroke()
    ctx.restore()

    // cabezales
    const a1 = pts[0], b1 = pts[1]
    const a2 = pts[pts.length - 2], b2 = pts[pts.length - 1]
    if (l.kind === 'Generalize') this.drawTriangleHead(b2.x, b2.y, a2.x, a2.y)
    if (l.kind === 'Aggregate' || l.kind === 'Compose') this.drawDiamondAtSource(a1.x, a1.y, b1.x, b1.y, l.kind === 'Compose')
    if (l.kind === 'Dependency') this.drawOpenArrowHead(b2.x, b2.y, a2.x, a2.y)

    // etiquetas
    ctx.save()
    ctx.font = this.font.text
    ctx.fillStyle = '#374151'
    const segIdx = Math.max(0, Math.floor((pts.length - 1) / 2) - 1)
    const mA = pts[segIdx], mB = pts[segIdx + 1]
    const nameX = (mA.x + mB.x) / 2, nameY = (mA.y + mB.y) / 2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    if (l.labels?.name) ctx.fillText(l.labels.name, nameX, nameY - 6)

    const ch = chooseSides(a, b)
    const srcSide = (l.anchorSrc?.side ?? ch.src.side) as Side
    const tgtSide = (l.anchorTgt?.side ?? ch.tgt.side) as Side
    const p0 = pts[0]
    const pn = pts[pts.length - 1]
    drawLabelAtSide(ctx, l.labels?.src, p0.x, p0.y, srcSide)
    drawLabelAtSide(ctx, l.labels?.tgt, pn.x, pn.y, tgtSide)
    ctx.restore()

    // handles en extremos (siempre visibles)
    this.drawHandle(pts[0].x, pts[0].y, sel)
    this.drawHandle(pts[pts.length - 1].x, pts[pts.length - 1].y, sel)

    // enlace discontínuo hacia clase asociativa
    if (l.assocClassId) {
      const ac = this.model.classes[l.assocClassId]
      if (ac) {
        const midp = this.polyMid(pts)
        const cx = ac.x + ac.w / 2
        const cy = ac.y + ac.h / 2
        ctx.save()
        ctx.setLineDash([5, 4])
        ctx.strokeStyle = '#9ca3af'
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(snap(midp.x), snap(midp.y))
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  private drawTriangleHead(x: number, y: number, fromX: number, fromY: number) {
    const ctx = this.ctx, angle = Math.atan2(y - fromY, x - fromX), size = 10
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size, size / 2); ctx.lineTo(-size, -size / 2); ctx.closePath()
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#6b7280'; ctx.fill(); ctx.stroke(); ctx.restore()
  }
  private drawDiamondAtSource(x: number, y: number, toX: number, toY: number, filled: boolean) {
    const ctx = this.ctx
    const angle = Math.atan2(toY - y, toX - x)
    const s = 8, offset = 1.5
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.translate(offset, 0)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(s, s / 2)
    ctx.lineTo(2 * s, 0)
    ctx.lineTo(s, -s / 2)
    ctx.closePath()
    ctx.fillStyle = filled ? '#6b7280' : '#fff'
    ctx.strokeStyle = '#6b7280'
    ctx.lineWidth = 1
    ctx.fill(); ctx.stroke(); ctx.restore()
  }
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }

  /** Devuelve el handle (src/tgt) bajo el puntero en coords de mundo, si lo hay */
  getEndpointHandleAt(px: number, py: number): null | { linkId: string; which: 'src' | 'tgt' } {
    for (const l of Object.values(this.model.links)) {
      const pts = this.getPolyline(l)
      const p0 = pts[0]
      const pn = pts[pts.length - 1]
      const d0 = Math.hypot(px - p0.x, py - p0.y)
      if (d0 <= HANDLE_HIT) return { linkId: l.id, which: 'src' }
      const dn = Math.hypot(px - pn.x, py - pn.y)
      if (dn <= HANDLE_HIT) return { linkId: l.id, which: 'tgt' }
    }
    return null
  }

  // ===== hit-test general (sin handles) =====
  hitTest(px: number, py: number): Hit {
    const nodes = Object.values(this.model?.classes ?? {})
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      if (px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h) {
        return { type: 'class', id: n.id }
      }
    }
    const tol = 6
    for (const l of Object.values(this.model?.links ?? {})) {
      const pts = this.getPolyline(l)
      if (distToPolyline(px, py, pts) <= tol) return { type: 'link', id: l.id }
    }
    return { type: 'blank' }
  }

  /** Importa un modelo en el formato generado por toExportJSONv2() */
  fromExportJSONv2(raw: unknown, opts: ImportOptions = {}) {
    const { autosize = true, replace = true } = opts

    // validar forma mínima
    const valid =
      raw &&
      typeof raw === 'object' &&
      'classes' in (raw as any) &&
      'links' in (raw as any)

    if (!valid) {
      console.warn('[fromExportJSONv2] payload inválido; se ignora.')
      return
    }

    const v2 = raw as ExportDiagramModelV2

    // construir contenedores destino
    const classes: Record<string, ClassNode> = {}
    const links: Record<string, LinkEdge> = {}

    // 1) Clases: convertir UMLAttr[] / UMLMethod[] a string[] (normalizando primero)
    for (const [id, c] of Object.entries(v2.classes || {})) {
      const attrsArr = Array.isArray(c.attributes) ? c.attributes : []
      const methsArr = Array.isArray(c.methods) ? c.methods : []

      const attributes = attrsArr
        .map(normalizeAttrForImport)
        .map(formatAttrLine)

      const methods = methsArr
        .map(normalizeMethodForImport)
        .map(formatMethodLine)

      classes[id] = {
        id: c.id ?? id,
        x: Math.round(c.x ?? 0),
        y: Math.round(c.y ?? 0),
        w: Math.round(c.w ?? 170),
        h: Math.round(c.h ?? 70),
        name: c.name ?? 'Tabla',
        attributes,
        methods,
      }
    }

    // 2) Enlaces: normalizar kind y copiar resto
    for (const [id, l] of Object.entries(v2.links || {})) {
      const k = (l.kind === 'AssociateClass') ? 'Associate' : (l.kind as RelationKind)

      links[id] = {
        id: l.id ?? id,
        kind: k,
        sourceId: l.sourceId,
        targetId: l.targetId,
        labels: l.labels ?? {},
        assocClassId: l.assocClassId, // si venía, se respeta
        anchorSrc: l.anchorSrc ?? null,
        anchorTgt: l.anchorTgt ?? null,
      }
    }

    // 3) Cargar en el modelo reactivo
    if (replace) {
      ; (this.model as any).classes = classes
        ; (this.model as any).links = links
    } else {
      Object.assign(this.model.classes, classes)
      Object.assign(this.model.links, links)
    }

    // 4) Ajuste de tamaños (opcional)
    if (autosize) {
      for (const c of Object.values(this.model.classes)) this.autoSize(c)
    }

    this.clearSelection()
    this.requestDraw()
  }
}
