---
name: offline-database
description: Guía para trabajar con el módulo OFFLINE de este proyecto (src/modules/offline/): SQLite en Web Worker con OPFS. Úsala al modificar offline.service.ts, database.ts, recordService.ts, schemaGenerator.ts, offline.models.ts, sqlite.worker.ts u OfflineTest.vue, o al solucionar problemas de esquema, tipos INTEGER/TEXT, schema-change-required o errores del worker SQLite. No la uses para el motor canvas ni los sockets (ver skill uml-editor).
---

# Módulo offline (SQLite/WASM + OPFS)

Base de datos local aislada en el navegador: SQLite compilado a WASM (`@sqlite.org/sqlite-wasm`) corriendo en un **Web Worker**, con persistencia en **OPFS**. Alimentado por el diagrama UML v2 del editor.

## 1. Arquitectura del módulo

Capas (de arriba a abajo):

- `src/modules/offline/pages/OfflineTest.vue` — página de prueba temporal (`/editor/offline-test`, lazy). Formularios INSERT/UPDATE, tablas, diagnóstico. Solo es una prueba de la API, no es la UX definitiva.
- `src/modules/offline/services/offline.service.ts` — singleton `offlineService`. Orquesta `generateOfflineSchema` + `OfflineDatabase` + `RecordService`. `initializeFromUml(uml)` es la entrada.
- `src/modules/offline/database/database.ts` — `OfflineDatabase`: **sin** sqlite-wasm directo. Es un wrapper promisificado del worker: `request(command, payload)` → `postMessage` con un `id` correlacionado; resuelve por `pending` map y rechaza en `error`.
- `src/modules/offline/database/schemaGenerator.ts` — convierte el UML v2 en `OfflineSchema` + `createStatements` (DDL), calcula el fingerprint `fnv1a`.
- `src/modules/offline/database/recordService.ts` — CRUD validado contra el esquema (INSERT/SELECT/UPDATE/DELETE con valores tipados). Existe solo cuando el esquema está `ready`.
- `src/modules/offline/workers/sqlite.worker.ts` — el worker real. Carga el binario desde `public/sqlite/sqlite3-bundler-friendly.mjs` con `import(/* @vite-ignore */ url)`, abre `OpfsDb`, ejecuta SQL. **NOTA:** vive en `workers/`, NO en `database/`.
- `src/modules/offline/models/offline.models.ts` — tipos del contrato interno: `OfflineSchema`, `OfflineTable`, `OfflineColumn`, `OfflineRecord`, `OfflineValue`, `OfflineWorkerRequest/Response`, estado `OfflineInitializeStatus` y `OfflineValidationError`.

Además:

- `src/modules/offline/offline.integration.example.ts` — ejemplo CRUD manual en consola; **no se importa** en la app. No borrarlo sin confirmar.
- Integración real: `initializeOfflineDatabase()` en `src/modules/editor/store/editor.store.ts` llama `offlineService.initializeFromUml(this.engine.toExportJSONv2())`.
- Ruta: `src/modules/editor/routes.ts` (child lazy `offline-test` → `/editor/offline-test`, requiere auth).
- Config: `vite.config.ts` (COOP/COEP, `optimizeDeps.exclude: ['@sqlite.org/sqlite-wasm']`, `worker.format: 'es'`, `assetsInclude: ['**/*.wasm']`) y binario en `public/sqlite/`.

## 2. Flujo UML → esquema SQLite → registros

1. El editor serializa `engine.toExportJSONv2()` (contrato v2 EXACTO: `classes`, `links`).
2. `generateOfflineSchema(uml)` recorre `uml.classes`:
   - nombre de tabla = `umlClass.name.trim()` → valida `IDENTIFIER` (`/^[A-Za-z_][A-Za-z0-9_]*$/`), rechaza duplicados (case-insensitive).
   - cada `attribute.name.trim()` → columna; tipo vía `normalizeType`; duplicados rechazados.
   - `isPrimaryKey = columnKey === 'id' && type === 'INTEGER'` (una sola PK permitida; si no hay PK válida, la tabla offline no se crea).
   - errores acumulados → `OfflineValidationError` sin tocar la BD.
3. El worker `initialize` crea las tablas + tabla `__offline_metadata` (guarda `schema_fingerprint`) en una transacción, SOLO si no existía fingerprint; calculado por `fingerprint(JSON.stringify(canonical))` (FNV-1a).
4. Si el fingerprint coincide → `ready`; si difiere → `schema-change-required` (datos intactos).
5. En `ready`, `offlineService` construye `new RecordService(database, schema)` y el CRUD pasa por `insert/findAll/findById/update/remove`.

## 3. Conversión de tipos UML → SQLite

`typeMap` en `schemaGenerator.ts` (`normalizeType`; `?? 'TEXT'` como default):

| UML (v2 `attribute.type`) | SQLite |
|---|---|
| `string`, `text`, `date`, `datetime` | `TEXT` |
| `int`, `integer`, `long`, `short`, `number`, `bigint` | `INTEGER` |
| `float`, `double`, `decimal` | `REAL` |
| `boolean`, `bool` | `INTEGER` (0/1; `toSqlValue` convierte booleans) |
| cualquier otro / vacío | `TEXT` |

Solo el atributo `id` de tipo `INTEGER` se marca `PRIMARY KEY`. No hay AUTOINCREMENT ni `NOT NULL` en el DDL; la obligatoriedad la impone la capa de formulario/validación.

## 4. Estados del esquema

`OfflineInitializeStatus = 'ready' | 'schema-change-required'` (devuelto por `initialize` del worker y por `initializeFromUml`):

- **`ready`**: el fingerprint persistido coincide con el del UML actual, o se creó la BD por primera vez. Se habilita `RecordService` y el CRUD.
- **`schema-change-required`**: `__offline_metadata.schema_fingerprint` NO coincide con el fingerprint del UML actual. El worker NO migra ni borra nada: respeta los datos existentes. La app debe coordinar el reemplazo/limpieza (no está automatizado).

Gotcha: si ya existe un fingerprint igual, el worker **no** re-ejecuta los `createStatements` (asume que las tablas existen). Si cambiaste el DDL sin tocar el fingerprint, la BD puede quedar inconsistente.

## 5. Cómo funcionan INSERT, UPDATE y DELETE

`RecordService.entries(table, data, op)` filtra contra el esquema:

- valida que cada clave exista como columna (`OfflineValidationError` si no).
- `validateValue(column, value, path)`: `TEXT` requiere `string`; `REAL` requiere `number` finito; `INTEGER` requiere `number` entero (o `boolean`, salvo en la columna `id`). `null` pasa (indefinido).
- `toSqlValue`: `boolean` → `Number` solo para `INTEGER`.
- SQL parametrizado (bind `?`), identificadores entre comillas dobles (`"..."`).

- `insert`: `INSERT INTO "T" (cols) VALUES (?,...)` → `{ changes }`.
- `findAll` / `findById`: `SELECT *`; filas devueltas tal cual (INTEGER/REAL llegan como `number` de JS).
- `update`: excluye la PK, genera `SET c1 = ?, c2 = ? WHERE pk = ?`.
- `remove`: `DELETE FROM t WHERE pk = ?`.
- `insert`/`update` requieren datos no vacíos; `update` requiere al menos una columna no PK.

## 6. Comunicación frontend ↔ worker (protocolo)

`OfflineDatabase.request(command, payload)`:

- commands: `initialize` (`{ databaseName, schema, createStatements }`), `execute` (`{ sql, params, returnsRows }`), `close`.
- Crea `OfflineWorkerRequest { id, command, payload }`, guarda `resolve/reject` en `pending`, hace `postMessage`.
- `onMessage`: correlaciona por `id`; `response.ok ? resolve(result) : reject(new Error(error))`.
- `onWorkerError`: rechaza TODAS las peticiones pendientes (ej. fallo al arrancar el worker).
- El worker responde `OfflineWorkerResponse { id, ok, result, error }` y nunca re-emite hacia el hilo principal más de lo pedido.

El worker importa el binario con URL calculada desde `import.meta.env.BASE_URL` + `public/sqlite/` y `self.location.origin`. NO renombrar/mover `public/sqlite/` ni quitar `optimizeDeps.exclude`.

## 7. Qué archivos SÍ puede modificar una tarea offline

- `src/modules/offline/models/offline.models.ts`
- `src/modules/offline/database/schemaGenerator.ts`
- `src/modules/offline/database/database.ts`
- `src/modules/offline/database/recordService.ts`
- `src/modules/offline/workers/sqlite.worker.ts`
- `src/modules/offline/services/offline.service.ts`
- `src/modules/offline/pages/OfflineTest.vue`
- (si es estrictamente necesario) `src/modules/editor/store/editor.store.ts` (acción `initializeOfflineDatabase`) y la ruta en `src/modules/editor/routes.ts`.

## 8. Qué NO modificar (salvo petición explícita)

Es el mismo contrato que protege `uml-editor`:

- `src/modules/editor/services/canvas.engine.ts` y `CanvasEditor.vue` — motor del editor; afecta IA, codegen y realtime.
- `src/modules/editor/services/editorService.ts` y `utils/uml-classic.ts` + `types/uml-classic.ts` — contrato REST y formato v2.
- Sockets: `src/modules/editor/hooks/useSalaSocket.ts` y, en el backend, `socket.controller.ts`.
- Headers COOP/COEP (`vite.config.ts`, `nginx.conf`) — rompen OPFS si se tocan. `optimizeDeps.exclude` y `worker.format` tampoco.
- El shape de `toExportJSONv2/fromExportJSONv2` (ver §9).
- Archivos `* copy.*` (`CanvasEditor copy.vue`, `useSalaSocket copy.ts`, etc.): NO se importan, editar siempre el archivo sin "copy", no borrarlos sin confirmar.

Si una tarea offline necesita tocar alguno de estos, primero preguntar y justificarlo; no hacerlo por comodidad.

## 9. Reglas para NO romper el contrato v2

- El módulo offline SOLO **lee** `uml.classes[*].name` y `attributes[*].{name,type,vis}` (schemaGenerator) y `offlineService.initializeFromUml` recibe el objeto de `toExportJSONv2()`. No cambiar su shape ni reordenar.
- Los IDs de clases/links son la llave de unión; no regenerarlos salvo `makeIdsUniqueAgainstCurrent` (append de imports).
- Cualquier cambio al v2 hay que sincronizarlo con el backend IA (`../diagramador_de_clases_backend/src/modules/ia/`), los generadores externos (`editorService.ts`) y este schemaGenerator. Round-trip de verificación: `toExportJSONv2()` → `fromExportJSONv2()` debe producir el mismo modelo.
- Whitelist de tipos UML que el editor usa: `int,bigint,float,double,decimal,string,text,bool,date,time,datetime,uuid,json`. `normalizeType` está preparado para lo que reciba, pero el layout del editor y el prompt IA asumen esa lista.

## 10. Diagnóstico

### Esquema no actualizado / columnas nuevas
- Síntoma: `status === 'schema-change-required'`. El fingerprint del UML actual difiere del guardado en `__offline_metadata.schema_fingerprint`.
- Causa típica: agregaste/renombraste/quitaste atributos o clases. El worker NO migra; para regenerar, limpiar la BD local (borrar el archivo OPFS `uml-offline.sqlite3` o cambiar el nombre en `offline.service.ts` `DATABASE_NAME`) o coordinar un reemplazo explícito.

### Tipos INTEGER/TEXT
- SQLite devuelve INTEGER/REAL como `number` de JS: `row.edad === 25` (no `"25"`). Al mostrarlos en formularios, normalizar con `String(...)`; nunca asumir string.
- `OfflineValidationError`: "Se esperaba INTEGER" → se envió un string aunque el esquema pida `number`; o un `number` a una columna TEXT.
- Gotcha de UI: `<input type="number">` + `v-model` castea automáticamente a `number` (Vue runtime-dom). Un número dentro de un modelo tipado `Record<string,string>` revienta llamadas tipo `value?.trim()`. Ejemplo real: `OfflineTest.vue:364` `insertForm.value[column.name]?.trim()` → `TypeError: ...?.trim is not a function`. El arreglo es normalizar con `String(value ?? '')` en validación/lectura, NO tocar `recordService.ts`.

### Validación de formularios (OfflineTest.vue)
- INSERT: todos los campos son obligatorios (incluso la PK) — el `validateInsertForm` rechaza si algo queda vacío.
- UPDATE: `valuesFrom` omite columnas vacías (`raw === ''` → `continue`); la PK nunca se actualiza.
- Enteros: regex `^[+-]?\d+$` + `Number.isSafeInteger`. TEXT pasa tal cual (con trim). REAL: `Number.isFinite`.
- Si un campo de la tabla no está en el formulario (PK en UPDATE), simplemente no se envía.

### Estado `schema-change-required`
- Se devuelve SOLO si ya existía un fingerprint distinto. Con BD nueva se crea y queda `ready`.
- En `OfflineTest.vue` el botón "Inicializar desde UML" muestra el mensaje y no borra datos. Esperado, no es un bug.

### Errores del worker / OPFS
- "OPFS no está disponible..." → el navegador no soporta OPFS o faltan headers COOP/COEP (`vite.config.ts` dev y `nginx.conf` prod). NO "arreglar" quitando los headers.
- Errores de inicialización WASM → verificar `public/sqlite/sqlite3-bundler-friendly.mjs` está servido correctamente y que `optimizeDeps.exclude` siga excluyendo `@sqlite.org/sqlite-wasm`.
- `OfflineDatabase` rechaza: un `execute` antes de `initialize` (valida en el worker `database?.isOpen()`), o `error` de red del worker (rechaza todas las pendientes).
- Mensajes entre hilos: si ves errores de postMessage/`id` sin resolver, asegúrate de que `response.id` exista en `pending` (worker viejo o doble instancia de `OfflineDatabase`).

## Verificaciones DESPUÉS de modificar

- `npm run typecheck` (vue-tsc). OJO: en Node v24 `vue-tsc` falla con `Search string not found: "/supportedTSExtensions/"`; usar `npm run build` como verificación estática equivalente.
- `npm run build` si cambia bundling/worker.
- Manual en `npm run dev` (`/editor/offline-test`, logueado): inicializar desde UML, insertar/editar/eliminar registros, consultar, volver a inicializar con un UML modificado (debe dar `schema-change-required`), y modo offline con red desactivada.