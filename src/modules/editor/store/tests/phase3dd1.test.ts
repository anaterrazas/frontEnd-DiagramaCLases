// Tests de identidad semántica persistente (Fase 3D-D1)
import { createServer } from 'vite'

let pass = 0
let fail = 0

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  }
  console.log(`  ✓ ${msg}`)
}

function runTest(name: string, fn: () => void): void {
  try {
    console.log(`\n▶ ${name}`)
    fn()
    pass++
  } catch (e) {
    fail++
    console.error(`  ✗ ${name}: ${e}`)
  }
}

type EngineLike = {
  addClass(x: number, y: number, name: string, id?: string): string
  updateClass(id: string, p: Record<string, unknown>): void
  addLink(kind: string, sourceId: string, targetId: string, id?: string): string
  updateLink(id: string, p: Record<string, unknown>): void
  toJSON(): { classes: Record<string, any>; links: Record<string, any> }
  fromJSON(raw: unknown): void
  model: { classes: Record<string, any>; links: Record<string, any> }
}

function makeCtx(): unknown {
  const noop = () => {}
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'measureText') return () => ({ width: 12, actualBoundingBoxAscent: 2, actualBoundingBoxDescent: 2 })
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
          return () => ({ addColorStop: noop })
        }
        if (prop === 'getImageData') return () => ({ data: [] })
        return noop
      },
      set() {
        return true
      },
    },
  )
}

function makeCanvas(): HTMLCanvasElement {
  return { getContext: () => makeCtx(), width: 1000, height: 800, clientWidth: 1000, clientHeight: 800 } as unknown as HTMLCanvasElement
}

async function main(): Promise<void> {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
    ssr: { noExternal: ['pinia'] },
  })

  try {
    const engineMod = await server.ssrLoadModule('/src/modules/editor/services/canvas.engine.ts')
    const CanvasEngine: new (canvas: HTMLCanvasElement) => EngineLike = engineMod.CanvasEngine
    const storeMod = await server.ssrLoadModule('/src/modules/editor/store/editor.store.ts')
    const piniaMod = await server.ssrLoadModule('pinia')

    globalThis.requestAnimationFrame = () => 0

    function makeStore(): any {
      piniaMod.setActivePinia(piniaMod.createPinia())
      const store = storeMod.useEditorStore()
      store.setEngine(new CanvasEngine(makeCanvas()))
      return store
    }

    function getClass(store: any, id: string): any {
      return store.umlModel.classifiers.find((c: any) => c.id === id)
    }

    /* =========================================================================
     * Test 1 — rename attribute
     * ========================================================================= */
    runTest('3DD1-1 — rename attribute preserva ID', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Persona', 'cls-persona')
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ nombre: string'] })
      store.syncUmlModelFromCanvas()

      const persona = getClass(store, 'cls-persona')
      const nombreId = persona.attributes.find((a: any) => a.name === 'nombre')?.id
      assert(nombreId, 'atributo nombre tiene ID')

      // Renombrar en canvas
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ nombreCompleto: string'] })
      store.syncUmlModelFromCanvas()

      const persona2 = getClass(store, 'cls-persona')
      const nombreCompletoId = persona2.attributes.find((a: any) => a.name === 'nombreCompleto')?.id
      assertEqual(nombreCompletoId, nombreId, 'ID conservado tras rename')
    })

    /* =========================================================================
     * Test 2 — type change
     * ========================================================================= */
    runTest('3DD1-2 — type change preserva ID', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Persona', 'cls-persona')
      store.engine.updateClass('cls-persona', { attributes: ['+ edad: int'] })
      store.syncUmlModelFromCanvas()

      const persona = getClass(store, 'cls-persona')
      const edadId = persona.attributes.find((a: any) => a.name === 'edad')?.id
      assert(edadId, 'atributo edad tiene ID')

      // Cambiar tipo
      store.engine.updateClass('cls-persona', { attributes: ['+ edad: bigint'] })
      store.syncUmlModelFromCanvas()

      const persona2 = getClass(store, 'cls-persona')
      const edadId2 = persona2.attributes.find((a: any) => a.name === 'edad')?.id
      assertEqual(edadId2, edadId, 'ID conservado tras type change')
    })

    /* =========================================================================
     * Test 3 — reorder
     * ========================================================================= */
    runTest('3DD1-3 — reorder preserva IDs', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Persona', 'cls-persona')
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ nombre: string', '+ edad: int'] })
      store.syncUmlModelFromCanvas()

      const persona = getClass(store, 'cls-persona')
      const idsOriginal = persona.attributes.map((a: any) => ({ name: a.name, id: a.id }))
      console.log('  Original:', idsOriginal.map(a => `${a.name}:${a.id}`).join(', '))

      // Reordenar en canvas: edad, nombre, id
      store.engine.updateClass('cls-persona', { attributes: ['+ edad: int', '+ nombre: string', '+ id: bigint'] })
      store.syncUmlModelFromCanvas()

      const persona2 = getClass(store, 'cls-persona')
      const edadId = persona2.attributes.find((a: any) => a.name === 'edad')?.id
      const nombreId = persona2.attributes.find((a: any) => a.name === 'nombre')?.id
      const idId = persona2.attributes.find((a: any) => a.name === 'id')?.id

      const originalEdad = idsOriginal.find(a => a.name === 'edad')?.id
      const originalNombre = idsOriginal.find(a => a.name === 'nombre')?.id
      const originalId = idsOriginal.find(a => a.name === 'id')?.id

      assertEqual(edadId, originalEdad, 'edad conserva ID')
      assertEqual(nombreId, originalNombre, 'nombre conserva ID')
      assertEqual(idId, originalId, 'id conserva ID')
    })

    /* =========================================================================
     * Test 4 — insert
     * ========================================================================= */
    runTest('3DD1-4 — insert no afecta IDs existentes', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Persona', 'cls-persona')
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ nombre: string', '+ edad: int'] })
      store.syncUmlModelFromCanvas()

      const persona = getClass(store, 'cls-persona')
      const idsOriginal = new Map(persona.attributes.map((a: any) => [a.name, a.id]))

      // Insertar 'direccion' entre id y nombre
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ direccion: string', '+ nombre: string', '+ edad: int'] })
      store.syncUmlModelFromCanvas()

      const persona2 = getClass(store, 'cls-persona')
      const idId = persona2.attributes.find((a: any) => a.name === 'id')?.id
      const nombreId = persona2.attributes.find((a: any) => a.name === 'nombre')?.id
      const edadId = persona2.attributes.find((a: any) => a.name === 'edad')?.id

      assertEqual(idId, idsOriginal.get('id'), 'id conserva ID')
      assertEqual(nombreId, idsOriginal.get('nombre'), 'nombre conserva ID')
      assertEqual(edadId, idsOriginal.get('edad'), 'edad conserva ID')

      // El nuevo tiene ID distinto
      const direccionId = persona2.attributes.find((a: any) => a.name === 'direccion')?.id
      assert(direccionId && direccionId !== idsOriginal.get('id') && direccionId !== idsOriginal.get('nombre') && direccionId !== idsOriginal.get('edad'), 'direccion tiene ID nuevo')
    })

    /* =========================================================================
     * Test 5 — delete
     * ========================================================================= */
    runTest('3DD1-5 — delete no afecta IDs restantes', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Persona', 'cls-persona')
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ nombre: string', '+ edad: int'] })
      store.syncUmlModelFromCanvas()

      const persona = getClass(store, 'cls-persona')
      const idsOriginal = new Map(persona.attributes.map((a: any) => [a.name, a.id]))

      // Eliminar 'nombre'
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ edad: int'] })
      store.syncUmlModelFromCanvas()

      const persona2 = getClass(store, 'cls-persona')
      const idId = persona2.attributes.find((a: any) => a.name === 'id')?.id
      const edadId = persona2.attributes.find((a: any) => a.name === 'edad')?.id

      assertEqual(idId, idsOriginal.get('id'), 'id conserva ID')
      assertEqual(edadId, idsOriginal.get('edad'), 'edad conserva ID')
    })

    /* =========================================================================
     * Test 6 — recreate same name
     * ========================================================================= */
    runTest('3DD1-6 — recreate same name genera nuevo ID', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Persona', 'cls-persona')
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ nombre: string'] })
      store.syncUmlModelFromCanvas()

      const persona = getClass(store, 'cls-persona')
      const originalNombreId = persona.attributes.find((a: any) => a.name === 'nombre')?.id

      // Eliminar y volver a crear con mismo nombre
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint'] })
      store.syncUmlModelFromCanvas()
      store.engine.updateClass('cls-persona', { attributes: ['+ id: bigint', '+ nombre: string'] })
      store.syncUmlModelFromCanvas()

      const persona2 = getClass(store, 'cls-persona')
      const nuevoNombreId = persona2.attributes.find((a: any) => a.name === 'nombre')?.id

      assert(nuevoNombreId !== originalNombreId, 'nuevo ID generado al recrear')
    })

    /* =========================================================================
     * Test 7 — duplicate names
     * ========================================================================= */
    runTest('3DD1-7 — duplicate names tienen IDs distintos', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Persona', 'cls-persona')
      store.engine.updateClass('cls-persona', { attributes: ['+ nombre: string', '+ nombre: string'] })
      store.syncUmlModelFromCanvas()

      const persona = getClass(store, 'cls-persona')
      const attrs = persona.attributes.filter((a: any) => a.name === 'nombre')
      assert(attrs.length === 2, 'dos atributos con mismo nombre')
      assert(attrs[0].id !== attrs[1].id, 'IDs diferentes')
    })

    /* =========================================================================
     * Test 8 — operation rename
     * ========================================================================= */
    runTest('3DD1-8 — rename operation preserva ID', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Persona', 'cls-persona')
      store.engine.updateClass('cls-persona', { methods: ['+ login(u: string): boolean'] })
      store.syncUmlModelFromCanvas()

      const persona = getClass(store, 'cls-persona')
      const loginId = persona.operations.find((o: any) => o.name === 'login')?.id

      store.engine.updateClass('cls-persona', { methods: ['+ autenticar(u: string): boolean'] })
      store.syncUmlModelFromCanvas()

      const persona2 = getClass(store, 'cls-persona')
      const autenticarId = persona2.operations.find((o: any) => o.name === 'autenticar')?.id

      assertEqual(autenticarId, loginId, 'operation ID conservado tras rename')
    })

    /* =========================================================================
     * Test 9 — parameter reorder
     * ========================================================================= */
    runTest('3DD1-9 — parameter reorder preserva IDs', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'Auth', 'cls-auth')
      store.engine.updateClass('cls-auth', { methods: ['+ login(usuario: string, password: string): boolean'] })
      store.syncUmlModelFromCanvas()

      const auth = getClass(store, 'cls-auth')
      const login = auth.operations.find((o: any) => o.name === 'login')
      const paramIds = new Map(login.parameters.map((p: any) => [p.name, p.id]))
      console.log('  Param IDs original:', Array.from(paramIds.entries()))

      // Reordenar parámetros
      store.engine.updateClass('cls-auth', { methods: ['+ login(password: string, usuario: string): boolean'] })
      store.syncUmlModelFromCanvas()

      const auth2 = getClass(store, 'cls-auth')
      const login2 = auth2.operations.find((o: any) => o.name === 'login')
      const usuarioId = login2.parameters.find((p: any) => p.name === 'usuario')?.id
      const passwordId = login2.parameters.find((p: any) => p.name === 'password')?.id

      assertEqual(usuarioId, paramIds.get('usuario'), 'usuario ID conservado')
      assertEqual(passwordId, paramIds.get('password'), 'password ID conservado')
    })

    /* =========================================================================
     * Test 10 — relationship change
     * ========================================================================= */
    runTest('3DD1-10 — relationship change preserva ID', () => {
      const store = makeStore()
      store.engine.addClass(100, 100, 'A', 'cls-A')
      store.engine.addClass(300, 100, 'B', 'cls-B')
      store.engine.addLink('Associate', 'cls-A', 'cls-B', 'link-AB')
      store.engine.updateLink('link-AB', { labels: { src: '1', tgt: '0..*' } })
      store.syncUmlModelFromCanvas()

      const assocId = store.umlModel.associations[0].id
      const srcMult = store.umlModel.associations[0].ends[0].multiplicity
      const tgtMult = store.umlModel.associations[0].ends[1].multiplicity

      // Cambiar multiplicidad
      store.engine.updateLink('link-AB', { labels: { src: '0..1', tgt: '1..*' } })
      store.syncUmlModelFromCanvas()

      const assocId2 = store.umlModel.associations[0].id
      assertEqual(assocId2, assocId, 'relation ID conservado tras multiplicidad change')

      const srcMult2 = store.umlModel.associations[0].ends[0].multiplicity
      const tgtMult2 = store.umlModel.associations[0].ends[1].multiplicity
      assertEqual(srcMult2, { lower: 0, upper: 1 }, 'src multiplicity updated')
      assertEqual(tgtMult2, { lower: 1, upper: '*' }, 'tgt multiplicity updated')
    })

    /* =========================================================================
     * RESUMEN
     * ========================================================================= */
    console.log(`\n=== RESULTADO ===`)
    console.log(`PASS: ${pass}`)
    console.log(`FAIL: ${fail}`)
    if (fail > 0) process.exitCode = 1
  } finally {
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})