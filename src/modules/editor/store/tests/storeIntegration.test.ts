// src/modules/editor/store/tests/storeIntegration.test.ts
// Tests unitarios de la integración UMLModel en editor.store (Fase 3A).
//
// Ejecutar con: npx tsx src/modules/editor/store/tests/storeIntegration.test.ts
//
// El store arrastra módulos que dependen de Vite (import.meta.env, ?worker),
// así que se carga a través de un servidor Vite SSR (Vite ya es dependencia del
// proyecto). No se modifica el motor, el editor, JSON v2, IA, Offline, Socket ni CodeGen.

import { createServer } from 'vite'

/* =========================================================================
 * HELPERS DE ASERCIÓN (mismo estilo que adapters/tests/adapter.test.ts)
 * ========================================================================= */

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

/* =========================================================================
 * HARNESS (Vite SSR + CanvasEngine real + pinia)
 * ========================================================================= */

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
  // Falso canvas con contexto 2d stub; el draw() del engine se ejecuta en cada
  // tick de rAF, que aquí está neutralizado, así que nunca toca geometría real.
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

    /** Diagrama base: Persona (id/items [0..*]/activo) + Mascota, asociación 1..0..* con anclas. */
    function seed(engine: EngineLike): void {
      engine.addClass(100, 100, 'Persona', 'cls-persona')
      engine.updateClass('cls-persona', {
        attributes: ['+ id: bigint', '+ items: string [0..*]', '+ activo: boolean = true'],
        methods: ['+ login(u: string, p: string): boolean'],
      })
      engine.addClass(400, 100, 'Mascota', 'cls-mascota')
      engine.addLink('Associate', 'cls-persona', 'cls-mascota', 'link-AB')
      engine.updateLink('link-AB', {
        labels: { src: '1', tgt: '0..*' },
        anchorSrc: { side: 'R', t: 0.5 },
        anchorTgt: { side: 'L', t: 0.5 },
      })
    }

    /* =========================================================================
     * TEST A — Canvas válido → syncUmlModelFromCanvas → UMLModel válido
     * ========================================================================= */
    runTest('A — Canvas → sync → UMLModel válido (clases, asociación, versión)', () => {
      const store = makeStore()
      // Antes de sincronizar el modelo NO está inicializado (flujo explícito)
      assert(store.umlModel === null, 'umlModel null antes de sync')

      seed(store.engine)
      const result = store.syncUmlModelFromCanvas()

      assert(result !== null, 'sync devuelve resultado')
      assert(store.umlModel !== null, 'umlModel queda disponible en el store')
      assertEqual(store.umlModel.umlVersion, '2.5.1', 'umlVersion 2.5.1')
      assertEqual(store.umlModel.formatVersion, '1.0', 'formatVersion 1.0')
      assertEqual(store.umlModel.classifiers.length, 2, '2 classifiers')
      assertEqual(store.umlModel.associations.length, 1, '1 asociación')
      assertEqual(store.umlModel.packages.length, 0, 'packages vacío')
      assert(store.umlView !== null, 'vista disponible')
      assertEqual(store.umlView.elements.length, 2, '2 elementos visuales')
      assertEqual(store.umlView.links.length, 1, '1 enlace visual')
      assert(Array.isArray(store.umlWarnings), 'warnings es array')
    })

    /* =========================================================================
     * TEST B — Modificar Canvas → resincronizar → modelo actualizado
     * ========================================================================= */
    runTest('B — Modificar Canvas y volver a sincronizar actualiza el modelo', () => {
      const store = makeStore()
      seed(store.engine)
      store.syncUmlModelFromCanvas()
      assertEqual(store.umlModel.classifiers.length, 2, 'antes: 2 clases')

      store.engine.addClass(700, 100, 'Nueva', 'cls-nueva')
      store.syncUmlModelFromCanvas()

      assertEqual(store.umlModel.classifiers.length, 3, 'después: 3 clases')
      const names = store.umlModel.classifiers.map((c: any) => c.name)
      assert(names.includes('Nueva'), 'la nueva clase está en el modelo')
      assertEqual(store.umlView.elements.length, 3, 'la vista también se actualiza')
    })

    /* =========================================================================
     * TEST C — applyUmlModelToCanvas no pierde representables y no encadena
     * ========================================================================= */
    runTest('C — applyUmlModelToCanvas() vuelca al Canvas sin perder representables', () => {
      const store = makeStore()
      seed(store.engine)
      store.syncUmlModelFromCanvas()

      const beforeJson = JSON.stringify(store.umlModel)
      store.applyUmlModelToCanvas()

      const classes = store.engine.model.classes
      const links = store.engine.model.links
      assert(classes['cls-persona'] !== undefined, 'Persona sigue en el Canvas')
      assert(classes['cls-mascota'] !== undefined, 'Mascota sigue en el Canvas')

      const attrsPersona = classes['cls-persona'].attributes
      const items = attrsPersona.find((a: string) => a.includes('items'))
      assert(items !== undefined && items.includes('[0..*]'), 'multiplicidad conservada en la línea')
      const login = classes['cls-persona'].methods.find((m: string) => m.includes('login'))
      assert(login !== undefined && login.includes('(u: string, p: string): boolean'), 'operación con parámetros conservada')

      const linkAB = links['link-AB']
      assert(linkAB !== undefined, 'asociación continúa en el Canvas')
      assertEqual(linkAB.kind, 'Associate', 'kind Associate')
      assertEqual(linkAB.labels.src, '1', 'multiplicidad src conservada')
      assertEqual(linkAB.labels.tgt, '0..*', 'multiplicidad tgt conservada')
      assertEqual(linkAB.anchorSrc?.side, 'R', 'ancla src conservada')
      assertEqual(linkAB.anchorTgt?.side, 'L', 'ancla tgt conservada')

      // No debe encadenar sync automática (evita loops Canvas → UML → Canvas…)
      assertEqual(JSON.stringify(store.umlModel), beforeJson, 'umlModel NO cambia tras apply (sin cascada)')
    })

    /* =========================================================================
     * TEST D — No se generan IDs artificiales (id1/id2/id3) y IDs estables
     * ========================================================================= */
    runTest('D — No se generan IDs artificiales', () => {
      const store = makeStore()
      seed(store.engine)
      store.syncUmlModelFromCanvas()

      const classifierIds = store.umlModel.classifiers.map((c: any) => c.id).sort()
      assertEqual(classifierIds, ['cls-mascota', 'cls-persona'], 'ids de clase = los del Canvas')
      assertEqual(store.umlModel.associations[0].id, 'link-AB', 'id de asociación = el del Canvas')
      assertEqual(store.umlModel.generalizations.length, 0, 'sin generalizaciones extra')
      assertEqual(store.umlModel.dependencies.length, 0, 'sin dependencias extra')
      assertEqual(store.umlModel.realizations.length, 0, 'sin realizaciones extra')

      const allIds = JSON.stringify(store.umlModel)
      assert(!/id[123]"/.test(allIds), 'no aparece id1/id2/id3')

      // Atributos/operaciones: IDs estables (UUID) que se conservan entre sincronizaciones
      const persona = store.umlModel.classifiers.find((c: any) => c.id === 'cls-persona')
      const firstAttrId = persona.attributes[0].id
      const firstOpId = persona.operations[0].id
      assert(typeof firstAttrId === 'string' && firstAttrId.length > 0, 'atributo tiene ID válido')
      assert(typeof firstOpId === 'string' && firstOpId.length > 0, 'operación tiene ID válido')

      // Segunda sincronización: los IDs deben ser estables
      store.syncUmlModelFromCanvas()
      const persona2 = store.umlModel.classifiers.find((c: any) => c.id === 'cls-persona')
      assertEqual(persona2.attributes[0].id, firstAttrId, 'ID de atributo estable tras re-sync')
      assertEqual(persona2.operations[0].id, firstOpId, 'ID de operación estable tras re-sync')
    })

    /* =========================================================================
     * TEST E — Multiplicidades continúan estructuradas
     * ========================================================================= */
    runTest('E — Multiplicidades estructuradas (atributo y extremos)', () => {
      const store = makeStore()
      seed(store.engine)
      store.syncUmlModelFromCanvas()

      const persona = store.umlModel.classifiers.find((c: any) => c.id === 'cls-persona')
      const itemsAttr = persona.attributes.find((a: any) => a.name === 'items')
      assertEqual(itemsAttr.type.name, 'string', 'el tipo NO incrusta la multiplicidad')
      assertEqual(itemsAttr.multiplicity, { lower: 0, upper: '*' }, 'multiplicidad [0..*] estructurada')

      const assoc = store.umlModel.associations[0]
      assertEqual(assoc.ends[0].multiplicity, { lower: 1, upper: 1 }, 'extremo src = 1')
      assertEqual(assoc.ends[1].multiplicity, { lower: 0, upper: '*' }, 'extremo tgt = 0..*')
    })

    /* =========================================================================
     * TEST F — Métodos con parámetros continúan estructurados
     * ========================================================================= */
    runTest('F — Operaciones con parámetros estructurados', () => {
      const store = makeStore()
      seed(store.engine)
      store.syncUmlModelFromCanvas()

      const persona = store.umlModel.classifiers.find((c: any) => c.id === 'cls-persona')
      const login = persona.operations.find((o: any) => o.name === 'login')
      assert(login !== undefined, 'operación login encontrada')
      assert(login.name !== 'login(u: string, p: string)' && !login.name.includes('('), 'name solo contiene el nombre')
      assertEqual(login.parameters.length, 2, '2 parámetros')
      assertEqual(login.parameters[0].name, 'u', 'parámetro 1: u')
      assertEqual(login.parameters[0].type.name, 'string', 'tipo del parámetro 1')
      assertEqual(login.parameters[1].name, 'p', 'parámetro 2: p')
      assertEqual(login.returnType?.name, 'boolean', 'return type boolean')
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