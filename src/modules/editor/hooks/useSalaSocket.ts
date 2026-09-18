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
type AddClassOp  = { type: 'class.add',  payload: { id: string; x: number; y: number; name?: string; attributes?: string[]; methods?: string[]; w?: number; h?: number } }
type MoveClassOp = { type: 'class.move', payload: { id: string; x: number; y: number } }
type UpdClassOp  = { type: 'class.update', payload: { id: string; name?: string; attributes?: string[]; methods?: string[]; w?: number; h?: number } }
type DelClassOp  = { type: 'class.delete', payload: { id: string } }

type AddLinkOp   = { type: 'link.add',    payload: { id: string; kind: string; sourceId: string; targetId: string; labels?: any; assocClassId?: string | null; anchorSrc?: Anchor | null; anchorTgt?: Anchor | null } }
type UpdLinkOp   = { type: 'link.update', payload: { id: string; labels?: any; kind?: string; assocClassId?: string | null; sourceId?: string; targetId?: string; anchorSrc?: Anchor | null; anchorTgt?: Anchor | null } }
type DelLinkOp   = { type: 'link.delete', payload: { id: string } }

type Op = AddClassOp | MoveClassOp | UpdClassOp | DelClassOp | AddLinkOp | UpdLinkOp | DelLinkOp

const PATCH_FLAG = '__opsPatched__' as const

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

    // ---- Estado inicial (Hidratado) ----
    s.on('state:set', ({ model }: { model: { classes: Record<string, any>; links: Record<string, any> } }) => {
      const eng = engine(); if (!eng) return
      runSilent(() => {
        // 1) Clases
        for (const c of Object.values(model.classes)) {
          if (eng.model.classes[c.id]) {
            const raw = (eng as any).__setPosRaw as (id: string, x: number, y: number) => void
            if (typeof c.x === 'number' && typeof c.y === 'number') {
              raw ? raw(c.id, c.x, c.y) : eng.setClassPosition(c.id, c.x, c.y)
            }
            ;(eng as any).__updClassRaw
              ? (eng as any).__updClassRaw(c.id, { name: c.name, attributes: c.attributes, methods: c.methods, w: c.w, h: c.h })
              : eng.updateClass(c.id, { name: c.name, attributes: c.attributes, methods: c.methods, w: c.w, h: c.h })
          } else {
            eng.addClass(c.x ?? 0, c.y ?? 0, c.name ?? 'Tabla', c.id)
            if (c.attributes || c.methods || c.w || c.h) {
              (eng as any).__updClassRaw
                ? (eng as any).__updClassRaw(c.id, { attributes: c.attributes, methods: c.methods, w: c.w, h: c.h })
                : eng.updateClass(c.id, { attributes: c.attributes, methods: c.methods, w: c.w, h: c.h })
            }
          }
        }

        // 2) Links
        for (const l of Object.values(model.links)) {
          if (!eng.model.links[l.id]) {
            eng.addLink(l.kind, l.sourceId, l.targetId, l.id)
          }
          // aseguro TODO el estado del link (incluye anclas)
          const apply = { kind: l.kind, labels: l.labels, assocClassId: l.assocClassId ?? null, anchorSrc: l.anchorSrc ?? null, anchorTgt: l.anchorTgt ?? null }
          ;(eng as any).__updLinkRaw
            ? (eng as any).__updLinkRaw(l.id, apply)
            : eng.updateLink(l.id, apply as any)
        }
      })
      eng.requestDraw()
    })

    // ---- Locks snapshot e incrementales ----
    s.on('locks:set', (remote: { classes: Record<string,string>; links: Record<string,string> }) => {
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
            // aplica metadatos, incl. anclas si vinieron
            const apply = { labels: p.labels, assocClassId: p.assocClassId ?? null, anchorSrc: p.anchorSrc ?? null, anchorTgt: p.anchorTgt ?? null }
            ;(eng as any).__updLinkRaw
              ? (eng as any).__updLinkRaw(p.id, apply)
              : eng.updateLink(p.id, apply as any)
            break
          }
          case 'link.update': {
            const p = payload as UpdLinkOp['payload']
            // aplica TODOS los campos que vengan (source/target/anclas/etc.)
            ;(eng as any).__updLinkRaw
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

    ;(s as any).__bind = { onConnect }
  }

  function unbind(s: Socket) {
    const b = (s as any).__bind
    s.off('connect', b?.onConnect)
    s.off('state:set')
    s.off('locks:set')
    s.off('locked')
    s.off('unlocked')
    s.off('op')
  }

  /* ================= Parchear engine (wrappers con 'silent') ================= */
  function patchEngine() {
    const eng = engine(); if (!eng) return
    if ((eng as any)[PATCH_FLAG]) return
    ;(eng as any)[PATCH_FLAG] = true

    // ---- métodos RAW para remoto/hidratado ----
    const _setPos = eng.setClassPosition.bind(eng)
    ;(eng as any).__setPosRaw = _setPos

    const _updClass = eng.updateClass.bind(eng)
    ;(eng as any).__updClassRaw = (id: string, p: any) => _updClass(id, p)

    const _updLink = eng.updateLink.bind(eng)
    ;(eng as any).__updLinkRaw = (id: string, p: any) => _updLink(id, p)

    // ---- addClass ----
    const _addClass = eng.addClass.bind(eng)
    eng.addClass = (x: number, y: number, name = 'Tabla', id?: string) => {
      const nid = _addClass(x, y, name, id)
      if (!silent && !id) send({ type: 'class.add', payload: { id: nid, x, y, name } })
      return nid
    }

    // ---- setClassPosition (coalesce con rAF) ----
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

    // ---- updateClass ----
    eng.updateClass = (id: string, p: any = {}) => {
      if (silent) { _updClass(id, p); return }
      if (isLocked('class', id)) return
      _updClass(id, p)
      const clean = toRaw(p) || {}
      send({ type: 'class.update', payload: { id, ...(clean as any) } })
    }

    // ---- deleteClass ----
    const _delClass = eng.deleteClass.bind(eng)
    eng.deleteClass = (id: string) => {
      if (silent) { _delClass(id); return }
      if (isLocked('class', id)) return
      _delClass(id)
      send({ type: 'class.delete', payload: { id } })
    }

    // ---- addLink ----
    const _addLink = eng.addLink.bind(eng)
    eng.addLink = (kind: string, a: string, b: string, id?: string) => {
      const lid = _addLink(kind, a, b, id)
      if (!silent && !id) {
        const L = eng.model.links[lid]
        send({
          type: 'link.add',
          payload: {
            id: lid,
            kind,
            sourceId: a,
            targetId: b,
            labels: L?.labels,
            assocClassId: (L as any)?.assocClassId ?? null,
            anchorSrc: (L as any)?.anchorSrc ?? null,
            anchorTgt: (L as any)?.anchorTgt ?? null,
          }
        })
      }
      return lid
    }

    // ---- updateLink (incluye source/target/anclas) ----
    eng.updateLink = (id: string, p: any = {}) => {
      if (silent) { _updLink(id, p); return }
      if (isLocked('link', id)) return
      _updLink(id, p)
      const clean = toRaw(p) || {}
      send({ type: 'link.update', payload: { id, ...(clean as any) } })
    }

    // ---- deleteLink ----
    const _delLink = eng.deleteLink.bind(eng)
    eng.deleteLink = (id: string) => {
      if (silent) { _delLink(id); return }
      if (isLocked('link', id)) return
      _delLink(id)
      send({ type: 'link.delete', payload: { id } })
    }

    // ---- Asociación + Clase ----
    const _addAssocBetween = eng.addAssociationClassBetween.bind(eng)
    eng.addAssociationClassBetween = (a: string, b: string, name?: string) => {
      const beforeClasses = new Set(Object.keys(eng.model.classes))
      const beforeAssocOfLink = new Map<string, string | null>()
      for (const [lid, L] of Object.entries(eng.model.links)) {
        beforeAssocOfLink.set(lid, (L as any).assocClassId ?? null)
      }

      const result = _addAssocBetween(a, b, name)

      const newClassIds = Object.keys(eng.model.classes).filter(id => !beforeClasses.has(id))
      const assocId = newClassIds[0]
      if (assocId) {
        for (const [lid, L] of Object.entries(eng.model.links)) {
          const after = (L as any).assocClassId ?? null
          const before = beforeAssocOfLink.get(lid) ?? null
          if (after !== before && after === assocId) {
            _updLink(lid, { assocClassId: assocId })
            if (!silent) send({ type: 'link.update', payload: { id: lid, assocClassId: assocId } })
          }
        }
      }
      return result
    }
  }

  // ---- Locks por selección ----
  watch(
    () => ({ kind: store.selected.kind, id: store.selected.id }),
    (sel, prev) => {
      if (prev?.id && prev?.kind) emit('unlock', { room: salaId, kind: prev.kind, id: prev.id })
      if (sel?.id && sel?.kind) emit('lock',   { room: salaId, clientId, kind: sel.kind, id: sel.id })
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

  return { isLocked, locks, clientId }
}
