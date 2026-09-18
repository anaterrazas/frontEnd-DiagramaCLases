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

    <p class="hint">tool: {{ tool }} — relation: {{ relationKind }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useEditorStore, type Tool } from "@/modules/editor/store/editor.store";
import type { RelationKind } from "@/modules/editor/services/canvas.engine";
import { notify } from "@/utils/snackbar";

const store = useEditorStore();
const { tool, relationKind, loading } = storeToRefs(store);
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
