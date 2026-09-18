<template>
  <section class="offline-test">
    <header>
      <h1>Prueba temporal: SQLite offline</h1>
      <p>
        Usa el UML v2 actual del editor; las operaciones se validan contra sus
        tablas y columnas.
      </p>
    </header>

    <div class="toolbar">
      <button :disabled="busy" @click="initialize">
        {{ busy ? "Inicializando…" : "Inicializar desde UML" }}
      </button>
      <button
        :disabled="busy || !selectedTable || status !== 'ready'"
        @click="refreshRows"
      >
        Consultar tabla
      </button>
      <button
        class="danger"
        :disabled="busy"
        title="Elimina la base SQLite de OPFS y la recrea desde el UML actual."
        @click="resetDatabase"
      >
        Reiniciar base offline
      </button>
      <RouterLink to="/editor">Volver al editor</RouterLink>
    </div>

    <p v-if="message" class="message">{{ message }}</p>
    <p v-if="error" class="error">{{ error }}</p>

    <section class="diagnostics">
      <h2>Diagnóstico</h2>
      <dl>
        <dt>SQLite inicializado</dt>
        <dd>{{ yesNo(sqliteInitialized) }}</dd>
        <dt>Worker funcionando</dt>
        <dd>{{ yesNo(workerWorking) }}</dd>
        <dt>OPFS disponible</dt>
        <dd>{{ yesNo(opfsAvailable) }}</dd>
        <dt>UML cargado</dt>
        <dd>{{ yesNo(umlLoaded) }}</dd>
        <dt>Esquema generado</dt>
        <dd>{{ yesNo(schemaGenerated) }}</dd>
        <dt>Estado del esquema</dt>
        <dd>{{ status }}</dd>
        <dt>Tablas creadas/detectadas</dt>
        <dd>{{ tableNames || "—" }}</dd>
        <dt>Atributos exportados (nombre: tipo)</dt>
        <dd>{{ exportedAttributes || "—" }}</dd>
      </dl>
    </section>

    <section v-if="schema" class="workspace">
      <aside>
        <h2>Tablas UML</h2>
        <button
          v-for="table in schema.tables"
          :key="table.name"
          :class="{ selected: selectedTable?.name === table.name }"
          @click="selectTable(table.name)"
        >
          {{ table.name }}
        </button>
      </aside>

      <main v-if="selectedTable">
        <h2>{{ selectedTable.name }}</h2>
        <p class="columns">
          {{
            selectedTable.columns
              .map(
                (column) =>
                  `${column.name}: ${column.type}${column.isPrimaryKey ? " PK" : ""}`,
              )
              .join(" · ")
          }}
        </p>

        <form class="record-form" @submit.prevent="insertRecord">
          <h3>Insertar registro</h3>
          <label
            v-for="column in selectedTable.columns"
            :key="`insert-${column.name}`"
          >
            {{ column.name }} ({{ column.type }})
            <input
              :value="insertForm[column.name]"
              :type="inputType(column.type)"
              :placeholder="
                column.isPrimaryKey ? 'Clave primaria' : column.name
              "
              @input="
                insertForm[column.name] = (
                  $event.target as HTMLInputElement
                ).value
              "
            />
          </label>
          <button :disabled="insertDisabled" type="submit">INSERT</button>
          <p class="form-diagnostic">
            Valores: <code>{{ JSON.stringify(insertForm) }}</code
            ><br />
            Validación: {{ insertValidation.valid ? "válida" : "inválida" }} —
            {{ insertDisabledReason }}
          </p>
        </form>

        <form
          v-if="editingId !== null"
          class="record-form edit"
          @submit.prevent="updateRecord"
        >
          <h3>Actualizar id {{ editingId }}</h3>
          <label
            v-for="column in editableColumns"
            :key="`update-${column.name}`"
          >
            {{ column.name }} ({{ column.type }})
            <input
              v-model="updateForm[column.name]"
              :type="inputType(column.type)"
            />
          </label>
          <button :disabled="busy || status !== 'ready'" type="submit">
            UPDATE
          </button>
          <button type="button" @click="cancelEdit">Cancelar</button>
        </form>

        <h3>Registros</h3>
        <p v-if="rows.length === 0">No hay registros.</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th v-for="column in selectedTable.columns" :key="column.name">
                  {{ column.name }}
                </th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="rowKey(row, index)">
                <td v-for="column in selectedTable.columns" :key="column.name">
                  {{ row[column.name] }}
                </td>
                <td>
                  <button :disabled="busy" @click="startEdit(row)">
                    Editar
                  </button>
                  <button :disabled="busy" @click="deleteRow(row)">
                    Eliminar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useEditorStore } from "@/modules/editor/store/editor.store";
import { offlineService } from "@/modules/offline/services/offline.service";
import type {
  OfflineColumnType,
  OfflineRecord,
  OfflineSchema,
  OfflineTable,
  OfflineValue,
  UmlDiagram,
} from "@/modules/offline/models/offline.models";

const UML_CACHE_KEY = "offline-test.uml-v2";
const store = useEditorStore();
const schema = ref<OfflineSchema | null>(null);
const selectedTableName = ref<string | null>(null);
const rows = ref<OfflineRecord[]>([]);
const insertForm = ref<Record<string, string>>({});
const updateForm = ref<Record<string, string>>({});
const editingId = ref<OfflineValue | null>(null);
const busy = ref(false);
const error = ref("");
const message = ref("");
const umlLoaded = ref(false);
const schemaGenerated = ref(false);
const sqliteInitialized = ref(false);
const workerWorking = ref(false);
const opfsAvailable = ref(false);
const status = ref<"not-initialized" | "ready" | "schema-change-required">(
  "not-initialized",
);

const selectedTable = computed<OfflineTable | null>(
  () =>
    schema.value?.tables.find(
      (table) => table.name === selectedTableName.value,
    ) ?? null,
);
const editableColumns = computed(
  () =>
    selectedTable.value?.columns.filter((column) => !column.isPrimaryKey) ?? [],
);
const tableNames = computed(
  () => schema.value?.tables.map((table) => table.name).join(", ") ?? "",
);
const exportedAttributes = ref("");

type InsertValidation = {
  valid: boolean;
  reason: string;
  values: OfflineRecord;
};

const insertValidation = computed<InsertValidation>(() => validateInsertForm());
const insertDisabled = computed(
  () => busy.value || status.value !== "ready" || !insertValidation.value.valid,
);
const insertDisabledReason = computed(() => {
  if (busy.value) return "La operación actual todavía está en curso.";
  if (status.value !== "ready")
    return `El esquema está en estado ${status.value}.`;
  return insertValidation.value.reason;
});

function yesNo(value: boolean): string {
  return value ? "sí" : "no";
}
function inputType(type: OfflineColumnType): "number" | "text" {
  return type === "TEXT" ? "text" : "number";
}

function isUmlDiagram(value: unknown): value is UmlDiagram {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    !!candidate.classes &&
    typeof candidate.classes === "object" &&
    !Array.isArray(candidate.classes) &&
    !!candidate.links &&
    typeof candidate.links === "object" &&
    !Array.isArray(candidate.links)
  );
}

function cachedUml(): UmlDiagram | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(UML_CACHE_KEY) ?? "null",
    );
    return isUmlDiagram(value) ? value : null;
  } catch {
    return null;
  }
}

function currentUml(): UmlDiagram | null {
  const engineUml = store.engine?.toExportJSONv2();
  if (engineUml) {
    sessionStorage.setItem(UML_CACHE_KEY, JSON.stringify(engineUml));
    exportedAttributes.value = describeAttributes(engineUml);
    return engineUml;
  }
  const cached = cachedUml();
  exportedAttributes.value = cached ? describeAttributes(cached) : "";
  return cached;
}

function describeAttributes(uml: UmlDiagram): string {
  return Object.values(uml.classes)
    .flatMap((umlClass) =>
      umlClass.attributes.map(
        (attribute) => `${umlClass.name}.${attribute.name}: ${attribute.type}`,
      ),
    )
    .join(" · ");
}

function resetForms(table: OfflineTable): void {
  insertForm.value = Object.fromEntries(
    table.columns.map((column) => [column.name, ""]),
  );
  updateForm.value = Object.fromEntries(
    table.columns
      .filter((column) => !column.isPrimaryKey)
      .map((column) => [column.name, ""]),
  );
  editingId.value = null;
}

async function initialize(): Promise<void> {
  const uml = currentUml();
  umlLoaded.value = !!uml;
  if (!uml) {
    error.value =
      "No hay un UML disponible. Abre primero el editor, crea el diagrama y entra a esta ruta sin recargar.";
    return;
  }
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const result = await offlineService.initializeFromUml(uml);
    schema.value = result.schema;
    schemaGenerated.value = true;
    status.value = result.status;
    workerWorking.value = true;
    opfsAvailable.value = result.storage === "opfs";
    sqliteInitialized.value = result.status === "ready";
    selectedTableName.value = result.schema.tables[0]?.name ?? null;
    if (selectedTable.value) resetForms(selectedTable.value);
    if (result.status === "ready") {
      message.value = result.migrationSummary
        ? `${result.migrationSummary} Los datos existentes se conservaron.`
        : "Esquema listo. Puedes insertar y consultar registros.";
      await refreshRows();
    } else {
      message.value =
        result.migrationSummary ??
        "El UML cambió respecto a la base persistida. No se modificaron datos.";
      if (result.destructiveChanges?.length) {
        error.value = `Cambios incompatibles detectados:\n${result.destructiveChanges
          .map((change) => `• ${change}`)
          .join("\n")}`;
      }
    }
  } catch (cause) {
    const text =
      cause instanceof Error
        ? cause.message
        : "No se pudo inicializar SQLite/WASM.";
    error.value = text;
    workerWorking.value = false;
    sqliteInitialized.value = false;
    opfsAvailable.value = false;
  } finally {
    busy.value = false;
  }
}

async function resetDatabase(): Promise<void> {
  const uml = currentUml();
  umlLoaded.value = !!uml;
  if (!uml) {
    error.value =
      "No hay un UML disponible. Abre primero el editor, crea el diagrama y entra a esta ruta sin recargar.";
    return;
  }
  const confirmed = window.confirm(
    "¿Reiniciar la base de datos offline?\n\nSe eliminarán todos los datos locales y la base se recreará desde el UML actual.",
  );
  if (!confirmed) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const result = await offlineService.resetFromUml(uml);
    schema.value = result.schema;
    schemaGenerated.value = true;
    status.value = result.status;
    workerWorking.value = true;
    opfsAvailable.value = result.storage === "opfs";
    sqliteInitialized.value = result.status === "ready";
    selectedTableName.value = result.schema.tables[0]?.name ?? null;
    rows.value = [];
    if (selectedTable.value) resetForms(selectedTable.value);
    if (result.status === "ready") {
      message.value =
        "Base offline reiniciada. Los datos anteriores se eliminaron y el esquema se recreó desde el UML.";
      await refreshRows();
    } else {
      message.value =
        result.migrationSummary ??
        "La base offline se reinició pero el esquema no quedó listo.";
      if (result.destructiveChanges?.length) {
        error.value = `Cambios incompatibles detectados:\n${result.destructiveChanges
          .map((change) => `• ${change}`)
          .join("\n")}`;
      }
    }
  } catch (cause) {
    const text =
      cause instanceof Error
        ? cause.message
        : "No se pudo reiniciar la base offline.";
    error.value = text;
    workerWorking.value = false;
    sqliteInitialized.value = false;
    opfsAvailable.value = false;
  } finally {
    busy.value = false;
  }
}

async function selectTable(tableName: string): Promise<void> {
  selectedTableName.value = tableName;
  const table = selectedTable.value;
  if (table) resetForms(table);
  await refreshRows();
}

function valuesFrom(
  form: Record<string, string>,
  columns: OfflineTable["columns"],
): OfflineRecord {
  const values: OfflineRecord = {};

  for (const column of columns) {
    const raw = String(form[column.name] ?? "").trim();

    if (raw === "") continue;

    values[column.name] = column.type === "TEXT" ? raw : Number(raw);
  }

  return values;
}

function validateInsertForm(): InsertValidation {
  const table = selectedTable.value;
  if (!table)
    return { valid: false, reason: "Selecciona una tabla UML.", values: {} };

  const values: OfflineRecord = {};
  for (const column of table.columns) {
    const raw = String(insertForm.value[column.name] ?? "").trim();
    if (!raw)
      return {
        valid: false,
        reason: `${column.name} es obligatorio.`,
        values: {},
      };

    if (column.type === "TEXT") {
      values[column.name] = raw;
      continue;
    }

    if (column.type === "INTEGER") {
      if (!/^[+-]?\d+$/.test(raw)) {
        return {
          valid: false,
          reason: `${column.name} debe ser un entero.`,
          values: {},
        };
      }
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) {
        return {
          valid: false,
          reason: `${column.name} está fuera del rango de enteros seguros.`,
          values: {},
        };
      }
      values[column.name] = value;
      continue;
    }

    const value = Number(raw);
    if (!Number.isFinite(value))
      return {
        valid: false,
        reason: `${column.name} debe ser un número válido.`,
        values: {},
      };
    values[column.name] = value;
  }
  return { valid: true, reason: "Registro listo para INSERT.", values };
}

async function insertRecord(): Promise<void> {
  if (!selectedTable.value) return;
  if (!insertValidation.value.valid) {
    error.value = insertValidation.value.reason;
    return;
  }
  await runMutation(async () => {
    await offlineService.insert(
      selectedTable.value!.name,
      insertValidation.value.values,
    );
    resetForms(selectedTable.value!);
    message.value = "Registro insertado.";
  });
}

async function startEdit(row: OfflineRecord): Promise<void> {
  if (!selectedTable.value) return;
  const key = selectedTable.value.columns.find((column) => column.isPrimaryKey);
  if (!key || row[key.name] === undefined || row[key.name] === null) {
    error.value = "La fila no tiene una clave primaria válida para actualizar.";
    return;
  }
  editingId.value = row[key.name];
  updateForm.value = Object.fromEntries(
    editableColumns.value.map((column) => [
      column.name,
      String(row[column.name] ?? ""),
    ]),
  );
}

function cancelEdit(): void {
  if (selectedTable.value) resetForms(selectedTable.value);
}

async function updateRecord(): Promise<void> {
  if (!selectedTable.value || editingId.value === null) return;
  await runMutation(async () => {
    await offlineService.update(
      selectedTable.value!.name,
      editingId.value!,
      valuesFrom(updateForm.value, editableColumns.value),
    );
    cancelEdit();
    message.value = "Registro actualizado.";
  });
}

async function deleteRow(row: OfflineRecord): Promise<void> {
  if (!selectedTable.value) return;
  const key = selectedTable.value.columns.find((column) => column.isPrimaryKey);
  const id = key ? row[key.name] : null;
  if (!key || id === undefined || id === null) {
    error.value = "La tabla necesita id entero para eliminar un registro.";
    return;
  }
  await runMutation(async () => {
    await offlineService.remove(selectedTable.value!.name, id);
    message.value = "Registro eliminado.";
  });
}

async function runMutation(action: () => Promise<void>): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await action();
    await refreshRows();
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "La operación no pudo completarse.";
  } finally {
    busy.value = false;
  }
}

async function refreshRows(): Promise<void> {
  if (!selectedTable.value || status.value !== "ready") return;
  try {
    rows.value = await offlineService.findAll(selectedTable.value.name);
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "No se pudieron consultar los registros.";
  }
}

function rowKey(row: OfflineRecord, index: number): string {
  const key = selectedTable.value?.columns.find(
    (column) => column.isPrimaryKey,
  );
  return String(key ? row[key.name] : index);
}

onMounted(() => {
  umlLoaded.value = !!currentUml();
});
</script>

<style scoped>
.offline-test {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
  color: #1f2937;
}
.toolbar,
.workspace,
.record-form {
  display: flex;
  gap: 12px;
}
.toolbar {
  align-items: center;
  margin: 16px 0;
}
button,
.toolbar a {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 12px;
  background: #fff;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.message {
  color: #166534;
}
.error {
  color: #b91c1c;
  white-space: pre-wrap;
}
button.danger {
  border-color: #fca5a5;
  color: #b91c1c;
  background: #fef2f2;
}
button.danger:hover:not(:disabled) {
  background: #fee2e2;
}
.diagnostics {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  background: #fff;
}
dl {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 6px 16px;
  margin: 0;
}
dt {
  font-weight: 600;
}
dd {
  margin: 0;
}
.workspace {
  align-items: flex-start;
}
.workspace aside {
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.workspace main {
  min-width: 0;
  flex: 1;
}
button.selected {
  background: #dbeafe;
  border-color: #2563eb;
}
.columns {
  color: #475569;
}
.record-form {
  flex-wrap: wrap;
  align-items: end;
  padding: 16px;
  margin: 16px 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}
.record-form h3,
.form-diagnostic {
  width: 100%;
  margin: 0;
}
.record-form label {
  display: grid;
  gap: 4px;
}
.record-form input {
  min-width: 130px;
  padding: 7px;
}
.form-diagnostic {
  color: #475569;
  font-size: 13px;
}
.form-diagnostic code {
  word-break: break-word;
}
.edit {
  background: #fffbeb;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}
th,
td {
  padding: 8px;
  border: 1px solid #e2e8f0;
  text-align: left;
}
td button {
  margin-right: 6px;
}
@media (max-width: 700px) {
  .workspace {
    flex-direction: column;
  }
  dl {
    grid-template-columns: 1fr;
    gap: 2px;
  }
  dd {
    margin-bottom: 8px;
  }
}
</style>
