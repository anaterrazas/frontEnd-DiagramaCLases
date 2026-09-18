import { onMounted, onBeforeUnmount, watch, reactive, toRaw } from 'vue'
import { nanoid } from 'nanoid'
import type { Socket } from 'socket.io-client'
import { connectSocket, disconnectSocket } from '@/modules/socket/services/socketService'
import { useEditorStore } from '@/modules/editor/store/editor.store'
import type { CanvasEngine } from '@/modules/editor/services/canvas.engine'

/* ================= Tipos extra (anclas de extremos) ================= */
type Side = 'L' | 'R' | 'T' | 'B'
type Anchor = { side: Side; t: number }

/* ================= Tipos de Ops ================= */
type AddClassOp = { type: 'class.add', payload: { id: string; x: number; y: number; name?: string; attributes?: string[]; methods?: string[]; w?: number; h?: number } }
type MoveClassOp = { type: 'class.move', payload: { id: string; x: number; y: number } }
type UpdClassOp = { type: 'class.update', payload: { id: string; name?: string; attributes?: string[]; methods?: string[]; w?: number; h?: number } }
type DelClassOp = { type: 'class.delete', payload: { id: string } }

type AddLinkOp = { type: 'link.add', payload: { id: string; kind: string; sourceId: string; targetId: string; labels?: any; assocClassId?: string | null; anchorSrc?: Anchor | null; anchorTgt?: Anchor | null } }
type UpdLinkOp = { type: 'link.update', payload: { id: string; labels?: any; kind?: string; assocClassId?: string | null; sourceId?: string; targetId?: string; anchorSrc?: Anchor | null; anchorTgt?: Anchor | null } }
type DelLinkOp = { type: 'link.delete', payload: { id: string } }

type Op = AddClassOp | MoveClassOp | UpdClassOp | DelClassOp | AddLinkOp | UpdLinkOp | DelLinkOp

const PATCH_FLAG = '__opsPatched__' as const

/* ===== Detectar si el snapshot es V2 (ExportDiagramModelV2) ===== */
function isV2Model(m: any): boolean {
  if (!m || typeof m !== 'object') return false
  if (!m.classes || !m.links) return false
  // heurística: al menos una clase con attributes como array de objetos con "name" o "vis"
  const anyClass = Object.values(m.classes as Record<string, any>)[0] as any
  if (!anyClass) return true // vacío: lo tratamos como v2
  const attrs = anyClass.attributes
  return Array.isArray(attrs) && (attrs.length === 0 || typeof attrs[0] === 'object')
}

export function useSalaSocket(salaId: string, engine: () => CanvasEngine | null) {
  const store = useEditorStore()
  const clientId = nanoid()
  let socket: Socket | null = null

  // Locks compartidos (id -> clientId)
  const locks = reactive({
    classes: {} as Record<string, string>,
    links: {} as Record<string, string>,
  })

  const emit = (event: string, data?: any) => socket?.emit(event, data)
  const send = (op: Op) => emit('op', { room: salaId, clientId, ...op })

  const isLocked = (kind: 'class' | 'link', id: string) => {
    const bag = kind === 'class' ? locks.classes : locks.links
    const owner = bag[id]
    return !!owner && owner !== clientId
  }

  /* ========= Guard para hidratar/aplicar remoto sin reemitir ========= */
  let silent = false
  const runSilent = (fn: () => void) => { silent = true; try { fn() } finally { silent = false } }

  /* ===================== Vincular socket ===================== */
  function bind(s: Socket) {
    const onConnect = () => {
      emit('room:join', { room: salaId, clientId })
      emit('state:get', { room: salaId })
    }
    s.on('connect', onConnect)

    // ---- Estado inicial (puede venir V1 o V2) ----
    s.on('state:set', ({ model }: { model: any }) => {
      const eng = engine(); if (!eng) return
      runSilent(() => {
        if (isV2Model(model)) {
          // 🚀 Nuevo: hidratar directamente con V2
          eng.fromExportJSONv2(model, { replace: true, autosize: true })
        } else {
          // 🔙 Compat: snapshot antiguo (strings)
          // 1) Clases
          for (const c of Object.values(model.classes || {})) {
            const cls: any = c
            if (eng.model.classes[cls.id]) {
              const raw = (eng as any).__setPosRaw as (id: string, x: number, y: number) => void
              if (typeof cls.x === 'number' && typeof cls.y === 'number') {
                raw ? raw(cls.id, cls.x, cls.y) : eng.setClassPosition(cls.id, cls.x, cls.y)
              }
              ; (eng as any).__updClassRaw
                ? (eng as any).__updClassRaw(cls.id, { name: cls.name, attributes: cls.attributes, methods: cls.methods, w: cls.w, h: cls.h })
                : eng.updateClass(cls.id, { name: cls.name, attributes: cls.attributes, methods: cls.methods, w: cls.w, h: cls.h })
            } else {
              eng.addClass(cls.x ?? 0, cls.y ?? 0, cls.name ?? 'Tabla', cls.id)
              if (cls.attributes || cls.methods || cls.w || cls.h) {
                (eng as any).__updClassRaw
                  ? (eng as any).__updClassRaw(cls.id, { attributes: cls.attributes, methods: cls.methods, w: cls.w, h: cls.h })
                  : eng.updateClass(cls.id, { attributes: cls.attributes, methods: cls.methods, w: cls.w, h: cls.h })
              }
            }
          }
          // 2) Links
          for (const l of Object.values(model.links || {})) {
            const L: any = l
            if (!eng.model.links[L.id]) {
              eng.addLink(L.kind, L.sourceId, L.targetId, L.id)
            }
            const apply = { kind: L.kind, labels: L.labels, assocClassId: L.assocClassId ?? null, anchorSrc: L.anchorSrc ?? null, anchorTgt: L.anchorTgt ?? null }
              ; (eng as any).__updLinkRaw
                ? (eng as any).__updLinkRaw(L.id, apply)
                : eng.updateLink(L.id, apply as any)
          }
        }
      })
      engine()?.requestDraw()
    })

    // ---- Reemplazo completo en caliente (siempre V2) ----
    s.on('state:replace', ({ model }: { model: any }) => {
      const eng = engine(); if (!eng) return
      runSilent(() => {
        eng.fromExportJSONv2(model, { replace: true, autosize: true })
      })
      eng.requestDraw()
    })

    // ---- Locks snapshot e incrementales ----
    s.on('locks:set', (remote: { classes: Record<string, string>; links: Record<string, string> }) => {
      for (const k of Object.keys(locks.classes)) delete locks.classes[k]
      for (const k of Object.keys(locks.links)) delete locks.links[k]
      Object.assign(locks.classes, remote.classes || {})
      Object.assign(locks.links, remote.links || {})
      engine()?.requestDraw()
    })
    s.on('locked', ({ kind, id, clientId: owner }: any) => {
      if (kind === 'class') locks.classes[id] = owner
      else if (kind === 'link') locks.links[id] = owner
      engine()?.requestDraw()
    })
    s.on('unlocked', ({ kind, id }: any) => {
      if (kind === 'class') delete locks.classes[id]
      else if (kind === 'link') delete locks.links[id]
      engine()?.requestDraw()
    })

    // ---- Ops remotas (aplicadas en modo silencioso) ----
    s.on('op', ({ clientId: from, type, payload }: any) => {
      if (from === clientId) return
      const eng = engine(); if (!eng) return

      runSilent(() => {
        switch (type as Op['type']) {
          case 'class.add': {
            const p = payload as AddClassOp['payload']
            eng.addClass(p.x, p.y, p.name ?? 'Tabla', p.id)
            if (p.attributes || p.methods || p.w || p.h) {
              (eng as any).__updClassRaw
                ? (eng as any).__updClassRaw(p.id, { attributes: p.attributes, methods: p.methods, w: p.w, h: p.h })
                : eng.updateClass(p.id, { attributes: p.attributes, methods: p.methods, w: p.w, h: p.h })
            }
            break
          }
          case 'class.move': {
            const p = payload as MoveClassOp['payload']
            const raw = (eng as any).__setPosRaw as (id: string, x: number, y: number) => void
            raw ? raw(p.id, p.x, p.y) : eng.setClassPosition(p.id, p.x, p.y)
            break
          }
          case 'class.update': {
            const p = payload as UpdClassOp['payload']
            (eng as any).__updClassRaw
              ? (eng as any).__updClassRaw(p.id, { name: p.name, attributes: p.attributes, methods: p.methods, w: p.w, h: p.h })
              : eng.updateClass(p.id, { name: p.name, attributes: p.attributes, methods: p.methods, w: p.w, h: p.h })
            break
          }
          case 'class.delete': {
            const p = payload as DelClassOp['payload']
            eng.deleteClass(p.id)
            break
          }
          case 'link.add': {
            const p = payload as AddLinkOp['payload']
            eng.addLink(p.kind, p.sourceId, p.targetId, p.id)
            const apply = { labels: p.labels, assocClassId: p.assocClassId ?? null, anchorSrc: p.anchorSrc ?? null, anchorTgt: p.anchorTgt ?? null }
              ; (eng as any).__updLinkRaw
                ? (eng as any).__updLinkRaw(p.id, apply)
                : eng.updateLink(p.id, apply as any)
            break
          }
          case 'link.update': {
            const p = payload as UpdLinkOp['payload']
              ; (eng as any).__updLinkRaw
                ? (eng as any).__updLinkRaw(p.id, p as any)
                : eng.updateLink(p.id, p as any)
            break
          }
          case 'link.delete': {
            const p = payload as DelLinkOp['payload']
            eng.deleteLink(p.id)
            break
          }
        }
      })
      eng.requestDraw()
    })

      ; (s as any).__bind = { onConnect }
  }

  function unbind(s: Socket) {
    const b = (s as any).__bind
    s.off('connect', b?.onConnect)
    s.off('state:set')
    s.off('state:replace')
    s.off('locks:set')
    s.off('locked')
    s.off('unlocked')
    s.off('op')
  }

  /* ================= Parchear engine (wrappers con 'silent') ================= */
  function patchEngine() {
    const eng = engine(); if (!eng) return
    if ((eng as any)[PATCH_FLAG]) return
      ; (eng as any)[PATCH_FLAG] = true

    const _setPos = eng.setClassPosition.bind(eng)
      ; (eng as any).__setPosRaw = _setPos

    const _updClass = eng.updateClass.bind(eng)
      ; (eng as any).__updClassRaw = (id: string, p: any) => _updClass(id, p)

    const _updLink = eng.updateLink.bind(eng)
      ; (eng as any).__updLinkRaw = (id: string, p: any) => _updLink(id, p)

    const _addClass = eng.addClass.bind(eng)
    eng.addClass = (x: number, y: number, name = 'Tabla', id?: string) => {
      const nid = _addClass(x, y, name, id)
      if (!silent && !id) send({ type: 'class.add', payload: { id: nid, x, y, name } })
      return nid
    }

    const pending = new Map<string, { x: number; y: number }>()
    let scheduled = false
    const flush = () => {
      scheduled = false
      for (const [id, { x, y }] of pending) send({ type: 'class.move', payload: { id, x, y } })
      pending.clear()
    }
    eng.setClassPosition = (id: string, x: number, y: number) => {
      if (silent) { _setPos(id, x, y); return }
      if (isLocked('class', id)) return
      _setPos(id, x, y)
      pending.set(id, { x, y })
      if (!scheduled) { scheduled = true; requestAnimationFrame(flush) }
    }

    eng.updateClass = (id: string, p: any = {}) => {
      if (silent) { _updClass(id, p); return }
      if (isLocked('class', id)) return
      _updClass(id, p)
      const clean = toRaw(p) || {}
      send({ type: 'class.update', payload: { id, ...(clean as any) } })
    }

    const _delClass = eng.deleteClass.bind(eng)
    eng.deleteClass = (id: string) => {
      if (silent) { _delClass(id); return }
      if (isLocked('class', id)) return
      _delClass(id)
      send({ type: 'class.delete', payload: { id } })
    }

    const _addLink = eng.addLink.bind(eng)
    eng.addLink = (kind: string, a: string, b: string, id?: string) => {
      const lid = _addLink(kind, a, b, id)
      if (!silent && !id) {
        const L = eng.model.links[lid]
        send({
          type: 'link.add',
          payload: {
            id: lid, kind, sourceId: a, targetId: b,
            labels: L?.labels, assocClassId: (L as any)?.assocClassId ?? null,
            anchorSrc: (L as any)?.anchorSrc ?? null, anchorTgt: (L as any)?.anchorTgt ?? null,
          }
        })
      }
      return lid
    }

    eng.updateLink = (id: string, p: any = {}) => {
      if (silent) { _updLink(id, p); return }
      if (isLocked('link', id)) return
      _updLink(id, p)
      const clean = toRaw(p) || {}
      send({ type: 'link.update', payload: { id, ...(clean as any) } })
    }

    const _delLink = eng.deleteLink.bind(eng)
    eng.deleteLink = (id: string) => {
      if (silent) { _delLink(id); return }
      if (isLocked('link', id)) return
      _delLink(id)
      send({ type: 'link.delete', payload: { id } })
    }
  }

  // --- helpers públicos para el componente ---
  function ensurePatched() { patchEngine() }
  function sendReplace() {
    const eng = engine(); if (!eng) return
    const v2 = eng.toExportJSONv2()
    emit('state:replace', { room: salaId, model: v2 })
  }

  // ---- Locks por selección ----
  watch(
    () => ({ kind: store.selected.kind, id: store.selected.id }),
    (sel, prev) => {
      emit('unlock', { room: salaId, kind: prev?.kind, id: prev?.id })
      if (sel?.id && sel?.kind) emit('lock', { room: salaId, clientId, kind: sel.kind, id: sel.id })
    }
  )

  onMounted(async () => {
    socket = await connectSocket()
    if (!socket) return
    bind(socket)
    patchEngine()
    emit('room:join', { room: salaId, clientId })
    emit('state:get', { room: salaId })
  })

  onBeforeUnmount(() => {
    const s = store.selected
    if (s.id && s.kind) emit('unlock', { room: salaId, kind: s.kind, id: s.id })
    if (socket) unbind(socket)
    disconnectSocket()
  })

  return { isLocked, locks, clientId, ensurePatched, sendReplace }
}
