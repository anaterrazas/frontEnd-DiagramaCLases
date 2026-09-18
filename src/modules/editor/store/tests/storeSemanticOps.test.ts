// src/modules/editor/store/tests/storeSemanticOps.test.ts
// Tests de las operaciones semánticas UML sobre editor.store (Fase 3B).
//
// Ejecutar con: npx tsx src/modules/editor/store/tests/storeSemanticOps.test.ts
//
// Flujo que verifican: operación → UMLModel → umlToCanvas → CanvasEngine.
// El Canvas permanece como representación DERIVADA; no hay watchers ni cascadas.

import { createServer } from 'vite'

/* =========================================================================
 * HELPERS DE ASERCIÓN (mismo estilo que adapter.test.ts / storeIntegration.test.ts)
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

    // Devuelve el UMLClass (objeto plano) del store por id.
    function getClass(store: any, id: string): any {
      return store.umlModel.classifiers.find((c: any) => c.id === id)
    }

    /* =========================================================================
     * 1 — Crear clase UML
     * ========================================================================= */
    runTest('3B-1 — createUmlClass → UMLClass válida (id, nombre, vacía, posición en view)', () => {
      const store = makeStore()
      const id = store.createUmlClass({ name: 'Persona', x: 120, y: 60 })

      assert(id !== null, 'devuelve id')
      const model = store.umlModel
      assert(model !== null, 'umlModel inicializado (sync explícita)')
      assertEqual(model.classifiers.length, 1, '1 classifier')
      const cls = model.classifiers[0]
      assertEqual(cls.kind, 'class', 'kind = class')
      assert(typeof cls.id === 'string' && cls.id.length > 0, 'id válido (string no vacío)')
      assertEqual(cls.name, 'Persona', 'nombre correcto')
      assertEqual(cls.visibility, 'public', 'visibility default coherente')
      assertEqual(cls.isAbstract, false, 'isAbstract inicializado')
      assertEqual(cls.attributes.length, 0, 'atributos vacíos')
      assertEqual(cls.operations.length, 0, 'operaciones vacías')
      assert(Array.isArray(cls.stereotypes), 'stereotypes array')

      assert(cls.x === undefined && cls.y === undefined, 'posición NO vive en UMLClass')
      const el = store.umlView.elements.find((e: any) => e.semanticElementId === id)
      assert(el !== undefined, 'elemento visual creado en UMLDiagramView')
      assertEqual(el.x, 120, 'x en la vista')
      assertEqual(el.y, 60, 'y en la vista')

      const canvasNode = store.engine.model.classes[id]
      assert(canvasNode !== undefined, 'la clase llega al Canvas como representación derivada')
    })

    /* =========================================================================
     * 2 — Renombrar clase
     * ========================================================================= */
    runTest('3B-2 — renameUmlClass actualiza UMLClass.name', () => {
      const store = makeStore()
      const id = store.createUmlClass({ name: 'A', x: 10, y: 10 })!

      const ok = store.renameUmlClass(id, 'Alfa')
      assert(ok, 'rename devuelve true')
      assertEqual(getClass(store, id).name, 'Alfa', 'name actualizado en UMLModel')
      assertEqual(store.engine.model.classes[id].name, 'Alfa', 'Canvas refleja el nombre')
      assert(!store.renameUmlClass(id, '   '), 'rename a vacío devuelve false')
      assert(!store.renameUmlClass('no-existe', 'X'), 'rename de clase inexistente devuelve false')
    })

    /* =========================================================================
     * 3 — Agregar atributo (como UMLProperty, no string)
     * ========================================================================= */
    runTest('3B-3 — addUmlProperty crea un UMLProperty estructurado', () => {
      const store = makeStore()
      const id = store.createUmlClass({ name: 'Persona', x: 0, y: 0 })!

      const pid = store.addUmlProperty(id, { name: 'nombre', type: 'string', visibility: 'private' })
      assert(pid !== null, 'devuelve id de atributo')

      const attr = getClass(store, id).attributes[0]
      assert(typeof attr === 'object' && !Array.isArray(attr), 'el atributo NO es un string')
      assertEqual(attr.id, pid, 'id presente')
      assertEqual(attr.name, 'nombre', 'name')
      assertEqual(attr.type.kind, 'primitive', 'type.kind')
      assertEqual(attr.type.name, 'string', 'type.name')
      assertEqual(attr.visibility, 'private', 'visibility')
      assertEqual(attr.multiplicity, { lower: 1, upper: 1 }, 'multiplicidad default')

      const lines = store.engine.model.classes[id].attributes
      assert(lines.includes('- nombre: string'), 'Canvas: línea "- nombre: string"')
    })

    /* =========================================================================
     * 4 — Modificar atributo
     * ========================================================================= */
    runTest('3B-4 — updateUmlProperty conserva name/type/multiplicity estructurados', () => {
      const store = makeStore()
      const id = store.createUmlClass({ name: 'Pedido', x: 0, y: 0 })!
      const pid = store.addUmlProperty(id, { name: 'items', type: 'string', multiplicity: '1' })!

      const ok = store.updateUmlProperty(id, pid, { name: 'elementos', type: 'int', multiplicity: '0..*' })
      assert(ok, 'update devuelve true')

      const attr = getClass(store, id).attributes.find((a: any) => a.id === pid)
      assertEqual(attr.id, pid, 'id conservado')
      assertEqual(attr.name, 'elementos', 'name actualizado')
      assertEqual(attr.type.name, 'int', 'type actualizado')
      assertEqual(attr.type.kind, 'primitive', 'type.kind actualizado')
      assertEqual(attr.multiplicity, { lower: 0, upper: '*' }, 'multiplicidad estructurada tras update')

      const lines = store.engine.model.classes[id].attributes
      assert(lines.includes('+ elementos: int [0..*]'), 'Canvas refleja el cambio')
    })

    /* =========================================================================
     * 5 — Eliminar atributo
     * ========================================================================= */
    runTest('3B-5 — deleteUmlProperty elimina del UMLModel', () => {
      const store = makeStore()
      const id = store.createUmlClass({ name: 'Persona', x: 0, y: 0 })!
      const p1 = store.addUmlProperty(id, { name: 'id', type: 'bigint' })!
      const p2 = store.addUmlProperty(id, { name: 'nombre', type: 'string' })!

      assert(store.deleteUmlProperty(id, p1), 'delete devuelve true')
      assert(getClass(store, id).attributes.find((a: any) => a.id === p1) === undefined, 'atributo eliminado del modelo')
      assert(getClass(store, id).attributes.find((a: any) => a.id === p2) !== undefined, 'el otro atributo sigue')
      assert(!store.deleteUmlProperty(id, 'no-existe'), 'delete de atributo inexistente → false')
    })

    /* =========================================================================
     * 6 — Agregar operación con parámetros
     * ========================================================================= */
    runTest('3B-6 — addUmlOperation con parámetros estructurados', () => {
      const store = makeStore()
      const id = store.createUmlClass({ name: 'AuthService', x: 0, y: 0 })!

      const oid = store.addUmlOperation(id, {
        name: 'login',
        parameters: [
          { name: 'usuario', type: 'string' },
          { name: 'password', type: 'string' },
        ],
        returnType: 'boolean',
      })
      assert(oid !== null, 'devuelve id de operación')

      const op = getClass(store, id).operations[0]
      assertEqual(op.name, 'login', 'name sin paréntesis')
      assert(!op.name.includes('('), 'los parámetros NO van en el nombre')
      assertEqual(op.parameters.length, 2, '2 parámetros')
      assertEqual(op.parameters[0].name, 'usuario', 'parameter[0].name')
      assertEqual(op.parameters[0].type.name, 'string', 'parameter[0].type')
      assertEqual(op.parameters[1].name, 'password', 'parameter[1].name')
      assertEqual(op.parameters[1].type.name, 'string', 'parameter[1].type')
      assertEqual(op.returnType?.name, 'boolean', 'returnType boolean')
      assertEqual(op.visibility, 'public', 'visibility default')
      assert(op.parameters.every((p: any) => typeof p === 'object' && p.name != null && p.type != null), 'todos los parámetros estructurados')

      const lines = store.engine.model.classes[id].methods
      assert(lines.includes('+ login(usuario: string, password: string): boolean'), 'Canvas: método formateado')
    })

    /* =========================================================================
     * 7 — Modificar operación
     * ========================================================================= */
    runTest('3B-7 — updateUmlOperation conserva parámetros y retorno estructurados', () => {
      const store = makeStore()
      const id = store.createUmlClass({ name: 'Svc', x: 0, y: 0 })!
      const oid = store.addUmlOperation(id, {
        name: 'login',
        parameters: [
          { name: 'usuario', type: 'string', id: 'par-usuario' },
          { name: 'password', type: 'string', id: 'par-password' },
        ],
        returnType: 'boolean',
      })!

      const ok = store.updateUmlOperation(id, oid, {
        name: 'autenticar',
        returnType: 'void',
        parameters: [
          { name: 'user', type: 'string', direction: 'in' },
          { name: 'pass', type: 'string' },
          { name: 'remember', type: 'bool', id: 'par-remember' },
        ],
      })
      assert(ok, 'update devuelve true')

      const op = getClass(store, id).operations.find((o: any) => o.id === oid)
      assertEqual(op.name, 'autenticar', 'name actualizado')
      assertEqual(op.returnType?.name, 'void', 'returnType actualizado y estructurado')
      assertEqual(op.parameters.length, 3, '3 parámetros')
      assertEqual(op.parameters[0].name, 'user', 'parámetro [0] reemplazado')
      assertEqual(op.parameters[0].type.name, 'string', 'tipo del parámetro [0]')
      assertEqual(op.parameters[0].id, 'par-usuario', 'id de parámetro conservado por posición')
      assertEqual(op.parameters[1].id, 'par-password', 'id del parámetro [1] conservado por posición')
      assertEqual(op.parameters[2].id, 'par-remember', 'id explícito del parámetro nuevo')
      assert(op.parameters.every((p: any) => p.name != null && p.type != null), 'parámetros siguen estructurados')

      const lines = store.engine.model.classes[id].methods
      assert(lines.includes('+ autenticar(user: string, pass: string, remember: bool): void'), 'Canvas: método actualizado')
    })

    /* =========================================================================
     * 8 — Eliminar operación
     * ========================================================================= */
    runTest('3B-8 — deleteUmlOperation elimina del UMLModel', () => {
      const store = makeStore()
      const id = store.createUmlClass({ name: 'Svc', x: 0, y: 0 })!
      const o1 = store.addUmlOperation(id, { name: 'a' })!
      const o2 = store.addUmlOperation(id, { name: 'b' })!

      assert(store.deleteUmlOperation(id, o1), 'delete devuelve true')
      assert(getClass(store, id).operations.find((o: any) => o.id === o1) === undefined, 'operación eliminada')
      assert(getClass(store, id).operations.find((o: any) => o.id === o2) !== undefined, 'la otra operación sigue')
    })

    /* =========================================================================
     * 9 — Crear relación (5 tipos soportados)
     * ========================================================================= */
    runTest('3B-9 — createUmlRelationship: Association/Aggregation/Composition/Generalization/Dependency', () => {
      const store = makeStore()
      const A = store.createUmlClass({ name: 'A', x: 0, y: 0 })!
      const B = store.createUmlClass({ name: 'B', x: 300, y: 0 })!
      const C = store.createUmlClass({ name: 'C', x: 150, y: 300 })!

      const relAssoc = store.createUmlRelationship({ kind: 'Association', sourceId: A, targetId: B, srcMultiplicity: '1', tgtMultiplicity: '0..*' })!
      store.createUmlRelationship({ kind: 'Aggregation', sourceId: A, targetId: C, srcMultiplicity: '1' })
      store.createUmlRelationship({ kind: 'Composition', sourceId: C, targetId: B })
      store.createUmlRelationship({ kind: 'Generalization', sourceId: C, targetId: A })
      store.createUmlRelationship({ kind: 'Dependency', sourceId: B, targetId: C })

      const model = store.umlModel
      assertEqual(model.associations.length, 3, '3 asociaciones')
      assertEqual(model.generalizations.length, 1, '1 generalización')
      assertEqual(model.dependencies.length, 1, '1 dependencia')

      const assoc = model.associations.find((a: any) => a.id === relAssoc)
      assertEqual(assoc.ends[0].type.classifierId, A, 'extremo src')
      assertEqual(assoc.ends[1].type.classifierId, B, 'extremo tgt')
      assertEqual(assoc.ends[0].multiplicity, { lower: 1, upper: 1 }, 'multiplicidad src estructurada')
      assertEqual(assoc.ends[1].multiplicity, { lower: 0, upper: '*' }, 'multiplicidad tgt estructurada')

      const agg = model.associations.find((a: any) => a.ends.some((e: any) => e.aggregation === 'shared'))
      assert(agg !== undefined, 'agregación → aggregation shared')
      const comp = model.associations.find((a: any) => a.ends.some((e: any) => e.aggregation === 'composite'))
      assert(comp !== undefined, 'composición → aggregation composite')
      assertEqual(model.generalizations[0].specificId, C, 'generalización: specific = source')
      assertEqual(model.generalizations[0].generalId, A, 'generalización: general = target')
      assertEqual(model.dependencies[0].clientId, B, 'dependencia: client = source')
      assertEqual(model.dependencies[0].supplierId, C, 'dependencia: supplier = target')

      const links = store.engine.model.links
      const kinds = Object.values(links).map((l: any) => l.kind).sort()
      assertEqual(kinds, ['Aggregate', 'Associate', 'Compose', 'Dependency', 'Generalize'], 'Canvas: 5 kinks desplegados')
    })

    /* =========================================================================
     * 10 — Aplicar UMLModel al Canvas (UML → umlToCanvas → Canvas)
     * ========================================================================= */
    runTest('3B-10 — UMLModel → umlToCanvas → CanvasEngine', () => {
      const store = makeStore()
      const A = store.createUmlClass({ name: 'A', x: 10, y: 10 })!
      store.addUmlProperty(A, { name: 'id', type: 'bigint' })
      store.addUmlProperty(A, { name: 'items', type: 'string', multiplicity: '0..*' })
      store.addUmlOperation(A, { name: 'login', parameters: [{ name: 'u', type: 'string' }], returnType: 'boolean' })
      const B = store.createUmlClass({ name: 'B', x: 400, y: 10 })!
      const L = store.createUmlRelationship({ kind: 'Association', sourceId: A, targetId: B, tgtMultiplicity: '0..*' })!

      store.applyUmlModelToCanvas() // volcar de nuevo de forma explícita

      const canvas = store.engine.model
      const ANode = canvas.classes[A]
      assert(ANode !== undefined, 'clase A en el Canvas')
      assertEqual(ANode.x, 10, 'posición desde la vista')
      const attrs = ANode.attributes
      assert(attrs.includes('+ id: bigint'), 'atributo convertido a línea')
      assert(attrs.includes('+ items: string [0..*]'), 'multiplicidad convertida a línea')
      assert(ANode.methods.includes('+ login(u: string): boolean'), 'operación formateada en el Canvas')
      assert(canvas.links[L] !== undefined, 'relación como link en el Canvas')
      assertEqual(canvas.links[L].sourceId, A, 'sourceId semántico')
      assertEqual(canvas.links[L].labels.tgt, '0..*', 'multiplicidad tgt en labels')
    })

    /* =========================================================================
     * 11 — Preservación de IDs (class/property/operation/relationship/parameter)
     * ========================================================================= */
    runTest('3B-11 — IDs preservados durante operaciones + aplicación al Canvas', () => {
      const store = makeStore()
      const clsId = store.createUmlClass({ name: 'A', id: 'cls-A', x: 0, y: 0 })!
      const propId = store.addUmlProperty(clsId, { name: 'id', type: 'bigint', id: 'prop-1' })!
      store.addUmlOperation(clsId, { name: 'm', parameters: [{ name: 'p', type: 'string', id: 'par-1' }], id: 'op-1' })
      const clsB = store.createUmlClass({ name: 'B', id: 'cls-B', x: 300, y: 300 })!
      const relId = store.createUmlRelationship({ kind: 'Dependency', sourceId: clsId, targetId: clsB, id: 'link-1' })!
      assert(relId === 'link-1', 'id de relación explícito')

      // un ciclo completo de operación → umlToCanvas → Canvas
      store.updateUmlProperty(clsId, propId, { name: 'identificador' })
      store.renameUmlClass(clsId, 'AA')

      assertEqual(store.umlModel.classifiers.find((c: any) => c.id === 'cls-A')?.id, 'cls-A', 'class id preservado en el modelo')
      assertEqual(store.umlModel.classifiers.find((c: any) => c.id === 'cls-A')?.attributes[0].id, 'prop-1', 'property id preservado')
      assertEqual(store.umlModel.classifiers.find((c: any) => c.id === 'cls-A')?.operations[0].id, 'op-1', 'operation id preservado')
      assertEqual(store.umlModel.classifiers.find((c: any) => c.id === 'cls-A')?.operations[0].parameters[0].id, 'par-1', 'parameter id preservado')
      assertEqual(store.umlModel.dependencies[0].id, 'link-1', 'relationship id preservado')

      const canvas = store.engine.model
      assert(canvas.classes['cls-A'] !== undefined, 'canvas: clase con el id semántico')
      assert(canvas.links['link-1'] !== undefined, 'canvas: link con el id de la relación')

      const other = store.createUmlClass({ name: 'C' })!
      assert(other !== clsId && other !== clsB, 'cada clase recibe un id distinto')
      assertEqual(store.umlModel.classifiers.find((c: any) => c.id === 'cls-A')?.id, 'cls-A', 'el id NO se regenera con más operaciones')
    })

    /* =========================================================================
     * 12 — Multiplicidades estructuradas (no incrustadas en el tipo)
     * ========================================================================= */
    runTest('3B-12 — Multiplicidades estructuradas en atributos y extremos', () => {
      const store = makeStore()
      const A = store.createUmlClass({ name: 'A', x: 0, y: 0 })!
      const B = store.createUmlClass({ name: 'B', x: 300, y: 0 })!

      store.addUmlProperty(A, { name: 'items', type: 'string', multiplicity: '0..*' })
      const attr = getClass(store, A).attributes[0]
      assertEqual(attr.type.name, 'string', 'el tipo NO incrusta la multiplicidad')
      assertEqual(attr.multiplicity, { lower: 0, upper: '*' }, 'multiplicidad estructurada')

      store.createUmlRelationship({ kind: 'Association', sourceId: A, targetId: B, srcMultiplicity: '1', tgtMultiplicity: '1..*' })
      const assoc = store.umlModel.associations[0]
      assertEqual(assoc.ends[0].multiplicity, { lower: 1, upper: 1 }, 'extremo src = 1')
      assertEqual(assoc.ends[1].multiplicity, { lower: 1, upper: '*' }, 'extremo tgt = 1..*')

      const line = store.engine.model.classes[A].attributes.find((s: string) => s.includes('items'))
      assert(line.includes(': string [0..*]'), 'Canvas: formato "string [0..*]"')
      assert(!line.includes(': string[0'), 'el tipo y la multiplicidad van separados')
    })

    /* =========================================================================
     * 13 — No aparecen IDs artificiales (id1/id2/id_auto)
     * ========================================================================= */
    runTest('3B-13 — No se generan IDs artificiales', () => {
      const store = makeStore()
      const A = store.createUmlClass({ name: 'A', x: 0, y: 0 })!
      const B = store.createUmlClass({ name: 'B', x: 300, y: 0 })!
      store.addUmlProperty(A, { name: 'id', type: 'bigint' })
      store.addUmlProperty(A, { name: 'nombre', type: 'string' })
      store.addUmlOperation(A, {
        name: 'login',
        parameters: [{ name: 'u', type: 'string' }, { name: 'p', type: 'string' }],
        returnType: 'boolean',
      })
      store.createUmlRelationship({ kind: 'Association', sourceId: A, targetId: B })
      store.createUmlRelationship({ kind: 'Generalization', sourceId: B, targetId: A })

      const dumped = JSON.stringify(store.umlModel)
      assert(!/[^a-zA-Z]id[123]"/.test(dumped), 'no aparece "id1"/"id2"/"id3"')
      assert(!dumped.includes('id_auto'), 'no aparece id_auto')
      const allIds = [...store.umlModel.classifiers.map((c: any) => c.id), A, B]
      assert(allIds.every((i) => i.length > 4), 'ids generados no son automáticos cortos')
    })

    /* =========================================================================
     * 14 — Una operación NO provoca cascada UML → Canvas → UML → Canvas
     * ========================================================================= */
    runTest('3B-14 — Sin cascada (no se re-sincroniza desde el Canvas)', () => {
      const store = makeStore()
      const A = store.createUmlClass({ name: 'A', x: 0, y: 0 })!
      const propId = store.addUmlProperty(A, { name: 'id', type: 'bigint' })!

      const before = JSON.stringify(store.umlModel)
      store.applyUmlModelToCanvas()
      assertEqual(JSON.stringify(store.umlModel), before, 'volcar al Canvas de nuevo no altera umlModel (sin loop)')

      // tras varias operaciones, los ids de atributos NO se re-derivan como si vinieran del Canvas
      store.renameUmlClass(A, 'Renombrada')
      store.addUmlOperation(A, { name: 'op' })
      const cls = getClass(store, A)
      assertEqual(cls.attributes[0].id, propId, 'id de atributo sigue siendo el semántico (no attr-<cls>-<i>)')
      assert(!cls.attributes[0].id.startsWith('attr-'), 'no hay re-derivación de ids por sync implícita')
      assertEqual(cls.name, 'Renombrada', 'cambios acumulados en el modelo semántico')
      assertEqual(store.engine.model.classes[A].name, 'Renombrada', 'el Canvas solo refleja el modelo')
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