# AGENTS.md

Proyecto "Diagramador de Clases" (Examen SW1). Bajo `PRIMER PARCIAL/` hay varios proyectos hermanos:
- `diagramador_de_clases_frontend/` (este directorio): SPA editor de diagramas UML.
- `diagramador_de_clases_backend/`: API Express + Socket.IO + IA.
- `demo/` (Spring Boot) y `flutter_base/` son plantillas de ejemplo de la salida de la generación de código; NO son el generador.
- Guía del proyecto: `Documentacion Diagramador De Clases Sw1-Examen.pdf` (raíz).

## Comandos
- Frontend (este dir): `npm run dev`, `npm run build`, `npm run preview`, `npm run typecheck` (vue-tsc). No hay lint ni tests.
- Backend (`../diagramador_de_clases_backend`): `npm run dev` (nodemon + ts-node `src/server.ts`), `npm run build` (tsc), `npm start` (node `dist/server.js`). No hay lint ni tests.
- Verificación: `npm run typecheck` (front) / `npm run build` (back). No inventar otros comandos.

## Arquitectura frontend
- Vue 3 + TS + Vite, alias `@` → `src/`. Estado con Pinia + `pinia-plugin-persistedstate`.
- El editor UML vive en `src/modules/editor/` y usa UN motor canvas propio en `services/canvas.engine.ts` (no JointJS/GrapesJS, aunque estén en `package.json`).
- Formato del diagrama = "v2": `{ classes: Record<id, ClassNode>, links: Record<id, LinkEdge> }` (`toExportJSONv2`/`fromExportJSONv2`). Es el CONTRATO con el backend IA y los generadores de código: respeta los shapes exactos (`visibility`, `returnType`/`type`, `params`, `labels{src,tgt}`, `anchorSrc{side,t}`, `assocClassId`...). Al cambiarlo hay que sincronizar el backend y los generadores externos.
- Generación de código NO está en el repo: el frontend llama a APIs externas definidas en `.env`:
  - `VITE_GENERATOR_API_BASE_URL` → `POST /api/codegen/flat` (ZIP Spring Boot)
  - `VITE_GENERATOR_FLUTTER_API_BASE_URL` → `POST /generate/flutter`
  - Services en `src/modules/editor/services/editorService.ts`; disparo desde `store/editor.store.ts` (`exportSpringBoot`/`exportFlutter`). Payloads: SpringBoot `{projectName, includeDto, diagram}`, Flutter `{app_name, api_base_url, diagram}`.
- Modo offline: `src/modules/offline/` usa `@sqlite.org/sqlite-wasm` en un web worker (OPFS). Requiere aislamiento cross-origin: COOP `same-origin` + COEP `require-corp` (ya en `vite.config.ts` dev y `nginx.conf` prod). El binario vive en `public/sqlite/`; `sqlite-wasm` está excluido de `optimizeDeps`.

## Backend (proyecto hermano)
- Express 5 + TS + Sequelize (Postgres). `src/config/database.ts` lanza error si faltan las `DATABASE_*` de env. `sequelize.sync` está COMENTADO en `src/server.ts`: usar migraciones de `sequelize-cli` (comandos en `commands.txt`).
- Env requerido: `GEMINI_API_KEY` (se loguea al arrancar), `DATABASE_*`, `JWT_SECRET`/`REFRESH_SECRET`, `CLIENT_ORIGIN`.
- Rutas: `/api/auth/*` público; `/api/salas/*` y `/api/user-salas/*` exigen JWT; `/api/ia/*` NO está protegido. `POST /api/ia/imagen` espera el campo multipart `imagen`.
- IA = Gemini 2.5-flash (`src/modules/ia/`): `/ia/texto` edita el diagrama v2 según el prompt; `/ia/imagen` convierte un boceto en JSON v2.
- Realtime (socket): eventos `room:join`, `state:get`/`state:set`, `lock`/`unlock`, `op` (broadcast, no se reemite al emisor), `presence:*`. Contrato activo en `socket.controller.ts` (back) y `useSalaSocket.ts` (front).

## Gotchas
- Hay archivos residuales `* copy.ts/.vue` (`CanvasEditor copy.vue`, `useSalaSocket copy.ts`, `socket.controller copy.ts`) que NO se importan. Ignorarlos y editar siempre el archivo sin "copy"; no borrarlos sin confirmar.
- No hay tests; el único chequeo es typecheck/build.
- Tocar los headers COOP/COEP rompe el modo offline (OPFS) en dev y prod.