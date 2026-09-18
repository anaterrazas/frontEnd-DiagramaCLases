---
name: uml-editor
description: Guía para trabajar con el editor UML de este proyecto (módulo src/modules/editor/). Úsala al modificar CanvasEngine (canvas.engine.ts), CanvasEditor.vue y componentes del canvas, editor.store.ts, servicios de IA/codegen, o el formato de diagrama JSON v2 (toExportJSONv2/fromExportJSONv2).
---

# Editor UML de diagramador_de_clases_frontend

## Arquitectura

- Vue 3 `<script setup>` SFCs + Pinia. La ruta del editor está en `src/modules/editor/routes.ts` (mounts `pages/Editor.vue` bajo el router).
- El editor usa **UN motor de canvas 2D propio** (`services/canvas.engine.ts`). NO usa JointJS ni GrapesJS aunque estén en `package.json`.
- Flujo: `components/Palette.vue` (montada desde `src/components/Sidebar.vue`) fija herramienta/tipo y dispara exportaciones; `components/CanvasEditor.vue` monta el `<canvas>` y traduce eventos de puntero/teclado a llamadas del engine; `store/editor.store.ts` guarda la referencia al engine y orquesta IA/import/codegen/selección; `components/PropertiesPanel.vue` enruta la edición a `ClassProperties.vue` (tablas) o `LinkProperties.vue` (relaciones).
- Realtime (salas): `hooks/useSalaSocket.ts` hace **monkey-patch** de métodos públicos del engine (`addClass`, `setClassPosition`, `updateClass`, `deleteClass`, `addLink`, `updateLink`, `deleteLink`, `addAssociationClassBetween`) para emitir `op` por socket y respetar locks. Si agregas un método público nuevo al engine que mute el modelo, NO se difundirá a otras salas salvo que lo parchees ahí y en `socket.controller.ts` del backend.

## CanvasEngine (`services/canvas.engine.ts`, ~970 líneas)

- Estado: `model` (reactive `DiagramModel { classes: Record<id,ClassNode>, links: Record<id,LinkEdge> }`), `selection`, `view` (viewport pan/zoom).
- `ClassNode` interno: `{ id, x, y, w, h, name, attributes: string[], methods: string[] }` — atributos/métodos se guardan como **líneas de texto** (p. ej. `"+ nombre: string"`). Las operaciones de edición deben pasar por `updateClass` para que se recalcule `autoSize`.
- `LinkEdge`: `{ id, kind, sourceId, targetId, labels?, assocClassId?, anchorSrc?, anchorTgt? }`. `kind` interno es SIEMPRE uno de `Associate|Aggregate|Compose|Generalize|Dependency`; `'AssociateClass'` solo aparece en exportación (se deriva de `assocClassId != null`).
- API pública que usan los componentes: `addClass`, `setClassPosition`, `updateClass`, `deleteClass`, `addLink`, `updateLink`, `deleteLink`, `addAssociationClassBetween`, `addAssociationClassOnLink`, `setSelectionClass/Link`, `clearSelection`, `hitTest`, `getEndpointHandleAt`, `toExportJSONv2`, `fromExportJSONv2`, `requestDraw`.
- Render: `draw()` en loop de `requestAnimationFrame`; routing ortogonal con "fan index" por lado, `anchorSrc/anchorTgt` (`{ side: 'L'|'R'|'T'|'B', t: 0..1 }`), self-loops solo válidos con `Associate`, y línea discontinua hacia la clase asociativa.

## `store/editor.store.ts`

- state: `engine`, `selected {kind,id}`, `tool`, `firstForLink`, `relationKind`, flags `loading*`, `broadcastReplace`.
- Acciones clave: `exportSpringBoot`/`exportFlutter` (serializan `toExportJSONv2()` y lo mandan al codegen externo), `sendPrompt` (chat IA → backend `/api/ia/texto`), `importarBoceto` (imagen → `/api/ia/imagen` → v2), y helpers de compatibilidad: `isExportV2`, `unwrapDiagramPayload`, `toExportV2FromSimple`, `makeIdsUniqueAgainstCurrent`, `offsetToRightOfCurrent`.

## Formato v2 y contrato EXACTO

- `toExportJSONv2()` produce `ExportDiagramModelV2`:
  - `classes: Record<id, { id, x, y, w, h, name, attributes: UMLAttr[], methods: UMLMethod[] }>`
  - `UMLAttr`: `{ vis: '+'|'-'|'#'|'~', name, type }` (type puede ser `''`).
  - `UMLMethod`: `{ vis, name, returnType }` (los params pueden venir como objeto `params: [{name,type}]` según el consumidor; el importador tolera ambos).
  - `links: Record<id, { id, kind, sourceId, targetId, labels?, assocClassId?, anchorSrc?, anchorTgt? }>`
  - `labels`: `{ name?, src?, tgt? }`. `anchorSrc/anchorTgt`: `{ side, t } | null`.
- El importador `fromExportJSONv2(opts: { autosize?, replace? })` normaliza: vis puede venir como `visibility`/`vis` o símbolo pegado al nombre, `AssociateClass` vuelve a `Associate` + `assocClassId`, y las líneas de texto se regeneran.
- Los ID de clases y links son la única llave de unión entre `classes`, `sourceId/targetId` y `assocClassId`. **No regenerarlos ni reemplazarlos** salvo al hacer append de imports (`makeIdsUniqueAgainstCurrent`).

## Reglas para NO romper compatibilidad con IA y generación de código

- El v2 es CONTRATO firme con: backend `/api/ia/texto` y `/api/ia/imagen` (prompt de referencia en `../diagramador_de_clases_backend/src/modules/ia/ia.controller.ts`) y generadores externos `VITE_GENERATOR_API_BASE_URL` (`POST /api/codegen/flat`, Spring Boot) y `VITE_GENERATOR_FLUTTER_API_BASE_URL` (`POST /generate/flutter`). Cambiar el shape rompe todo.
- Whitelist de tipos (la usan ClassProperties y el prompt IA): `int,bigint,float,double,decimal,string,text,bool,date,time,datetime,uuid,json`.
- Whitelist de multiplicidades: `'0..1','1','0..*','1..*','*'`.
- Visibilidad: `+ - # ~`; default `+`.
- Endpoints esperan nombres de campos fijos: campo multipart `imagen`, y `diagrama`/`promptext` en `/ia/texto`. No renombrar.
- Reglas UX del editor que no debes saltarte: self-links solo con `Associate`; `Generalize`/`Dependency` no usan multiplicidades (LinkProperties las deshabilita); `deleteClass` también borra los links incidentes y limpia `assocClassId`.

## Archivos que NO debes modificar innecesariamente

- `services/canvas.engine.ts` — núcleo; cualquier cambio impacta IA, codegen y realtime.
- `services/editorService.ts` — contrato REST con los generadores externos (payloads y endpoints).
- `utils/uml-classic.ts` + `types/uml-classic.ts` — formateo/parseo del formato v2.
- `.env` — URLs de generadores. `vite.config.ts` y `nginx.conf` — headers COOP/COEP (tocarlos rompe el modo offline OPFS).

## Archivos "* copy.*" que debes ignorar

- `src/modules/editor/components/CanvasEditor copy.vue` y `src/modules/editor/hooks/useSalaSocket copy.ts` (también `socket.controller copy.ts` en el backend). **No se importan en ninguna parte.** Edita SIEMPRE el archivo sin "copy"; no los borres sin confirmación previa.

## Procedimiento recomendado ANTES de modificar el editor

1. Leer la API completa de `canvas.engine.ts` y los componentes que consumen cada método (no asumir comportamiento por el nombre).
2. Si el cambio toca el modelo o la serialización, verificar el round-trip `toExportJSONv2()` → `fromExportJSONv2()`.
3. Si el cambio afecta el shape v2, revisar el prompt IA en el backend y los payloads de `editorService.ts`.
4. Si se añade un método público al engine que muta el modelo: planificar el parche correspondiente en `useSalaSocket.ts` (+ handler en backend if op nueva).
5. Mantener estilos de un solo método/acción por línea, comentarios en español concisos, y no añadir librerías nuevas.

## Verificaciones DESPUÉS de modificar

- `npm run typecheck` (vue-tsc --noEmit). No hay tests ni lint en este repo — esta es la única verificación estática.
- `npm run build` si el cambio toca bundling.
- Probar en el browser con `npm run dev`, al menos: agregar/editar/eliminar tablas y relaciones, arrastrar extremos de un link (anclas), self-loop, clase asociativa, export e import de diagrama, chat IA, importar boceto y modo offline.
- Verificar que `toExportJSONv2()` mantiene el shape exacto de `classes`/`links` (contrato v2) antes y después del cambio.