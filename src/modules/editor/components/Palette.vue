<template>
  <div class="palette">
    <h3>Herramientas</h3>

    <button
      :class="{ active: tool === 'add-class' }"
      @click="setTool('add-class')"
    >
      Insertar tabla
    </button>

    <div class="row">
      <button
        :class="{ active: tool === 'add-link' || tool === 'add-assoc-class' }"
        @click="setTool('add-link')"
      >
        Insertar relación
      </button>

      <select
        v-if="tool === 'add-link' || tool === 'add-assoc-class'"
        :value="selectValue"
        @change="onSelectChange(($event.target as HTMLSelectElement).value)"
        class="style-chooser"
      >
        <option value="Associate">Associate</option>
        <option value="Aggregate">Aggregate</option>
        <option value="Compose">Compose</option>
        <option value="Generalize">Generalize</option>
        <option value="Dependency">Dependency</option>
        <option value="AssociationClass">Association + Class</option>
      </select>
    </div>

    <button v-if="tool !== 'select'" class="secondary" @click="reset()">
      Cancelar
    </button>

    <button @click="dumpJson">Exportar JSON (console)</button>

    <button :disabled="loading" @click="onExport">
      {{ loading ? "Generando…" : "Exportar Spring Boot" }}
    </button>

    <!--
    <button :disabled="loading" @click="onExportFlutter">
      {{ loading ? "Generando…" : "Exportar Flutter" }}
    </button> -->
    <!-- NUEVO: Importar Boceto -->
    <button :disabled="loading" @click="onImportClick">
      {{ loading ? "Importando…" : "Importar Boceto" }}
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFilePicked"
    />

    <button :disabled="loading" @click="onSaveProject">
      Guardar proyecto
    </button>

    <button :disabled="loading || exportingXmi" @click="onExportXmi">
      {{ exportingXmi ? "Exportando XMI…" : "Exportar XMI" }}
    </button>

    <button :disabled="loading" @click="onOpenProjectClick">
      Abrir proyecto
    </button>
    <input
      ref="umlProjectInput"
      type="file"
      accept=".umlproject,application/json"
      class="hidden"
      @change="onUmlProjectPicked"
    />

    <p class="hint">tool: {{ tool }} — relation: {{ relationKind }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useEditorStore, type Tool } from "@/modules/editor/store/editor.store";
import type { RelationKind } from "@/modules/editor/services/canvas.engine";
import { canvasSnapshotToUmlProjectDocument } from "@/modules/editor/adapters/canvasToUmlProjectDocument";
import { exportDrawSchemaToXmi } from "@/core/uml/xmi/bridge";
import { notify } from "@/utils/snackbar";

const store = useEditorStore();
const { tool, relationKind, loading, umlModel, umlView } = storeToRefs(store);
const exportingXmi = ref(false);
function setTool(t: Tool) {
  store.setTool(t);
}
function reset() {
  store.resetTool();
}

function dumpJson() {
  const m = store.engine?.toExportJSONv2();
  if (!m) return;
  console.log("Diagram JSON (objeto):", m);
  console.log("Diagram JSON (string):\n", JSON.stringify(m, null, 2));
}

function onExport() {
  const diagramaJson = store.engine?.toExportJSONv2();
  store.exportSpringBoot(diagramaJson as any);
  notify("Backend Generado");
}

function onExportFlutter() {
  const diagramaJson = store.engine?.toExportJSONv2();
  store.exportFlutter(diagramaJson as any);
  notify("Frontend Generado");
}
// NUEVO: importar boceto (imagen)
const fileInput = ref<HTMLInputElement | null>(null);

function onImportClick() {
  fileInput.value?.click();
}

// Persistencia local: guardar/abrir proyecto (.umlproject)
const umlProjectInput = ref<HTMLInputElement | null>(null);

async function onSaveProject() {
  await store.exportUmlProjectFile();
  notify("Proyecto guardado correctamente");
}

async function onExportXmi() {
  if (exportingXmi.value) return;
  exportingXmi.value = true;

  try {
    const snapshot = store.engine?.toJSON();
    if (!snapshot) {
      notify("El editor no está inicializado", "error");
      return;
    }

    const project = canvasSnapshotToUmlProjectDocument(snapshot, {
      documentId: umlModel.value?.id ?? "uml-project",
      documentName: umlModel.value?.name ?? "Diagrama de clases",
      modelId: umlModel.value?.id,
      viewId: umlView.value?.id,
      activeDiagramId: umlView.value?.id,
    });
    const result = exportDrawSchemaToXmi(project.document, { pretty: true });

    if (result.errors.length > 0) {
      notify(`No se exportó XMI: ${result.errors.join(" ")}`, "error");
      return;
    }

    downloadXmi(result.xmi, project.document.name);
    if (result.warnings.length > 0) {
      notify(`XMI exportado con advertencias: ${result.warnings.join(" ")}`, "warning");
    } else {
      notify("XMI exportado correctamente");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    notify(`No se pudo exportar XMI: ${message}`, "error");
  } finally {
    exportingXmi.value = false;
  }
}

function downloadXmi(xmi: string, projectName: string): void {
  const blob = new Blob([xmi], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = url;
    anchor.download = normalizeXmiFilename(projectName);
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

function normalizeXmiFilename(projectName: string): string {
  const sanitized = projectName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.xmi$/i, "")
    .replace(/[. ]+$/g, "");

  return `${sanitized || "uml-project"}.xmi`;
}

function onOpenProjectClick() {
  umlProjectInput.value?.click();
}

async function onUmlProjectPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await store.importUmlProjectFile(file);
    notify("Proyecto abierto correctamente");
  } finally {
    if (input) input.value = "";
  }
}

async function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await store.importarBoceto(file); // << implementado en el store
    notify("Boceto Importado Correctamente");
  } finally {
    // limpiar el input para poder re-seleccionar el mismo archivo si se desea
    if (input) input.value = "";
  }
}

// selectValue y cambio de relación
const selectValue = computed(() =>
  tool.value === "add-assoc-class" ? "AssociationClass" : relationKind.value,
);

function onSelectChange(v: string) {
  if (v === "AssociationClass") {
    store.setAssociationClassMode();
  } else {
    store.setTool("agregar");
    store.setRelationKind(v as RelationKind);
  }
}

function setRelation(k: string) {
  onSelectChange(k);
}
</script>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  gap: 8px;
  align-items: center;
}

button {
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #288d5c;
  cursor: pointer;
}

button.active {
  border-color: #2b6cb0;
  box-shadow: 0 0 0 2px rgba(43, 108, 176, 0.15);
}

button.secondary {
  background: #f6f6f6;
}

.hint {
  font-size: 12px;
  color: #720e0e85;
  margin: 0;
}

.hidden {
  display: none;
}

.style-chooser {
  height: 45px;
}
</style>
