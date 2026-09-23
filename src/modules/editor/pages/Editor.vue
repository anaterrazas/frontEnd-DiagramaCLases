<template>
  <div class="layout">
    <main class="center">
      <CanvasEditor />
      <div class="quick-actions">
        <section class="quick-card">
          <h2>Insertar</h2>
          <div class="quick-buttons">
            <button @click="store.setTool('add-class')">Tabla</button>
            <button @click="store.setTool('add-link')">Relación</button>
          </div>
        </section>
        <section class="quick-card">
          <h2>Exportar</h2>
          <div class="quick-buttons">
            <button @click="dumpJson">JSON (consola)</button>
            <button @click="exportSpringBoot">SpringBoot</button>
          </div>
        </section>
      </div>
    </main>
    <aside class="right">
      <PropertiesPanel />
    </aside>
  </div>
</template>

<script setup lang="ts">
import Palette from "@/modules/editor/components/Palette.vue";
import CanvasEditor from "@/modules/editor/components/CanvasEditor.vue";
import PropertiesPanel from "@/modules/editor/components/PropertiesPanel.vue";
import { useEditorStore } from "@/modules/editor/store/editor.store";

const store = useEditorStore();

function dumpJson() {
  const diagram = store.engine?.toExportJSONv2();
  if (diagram) console.log("Diagram JSON:", diagram);
}

function exportSpringBoot() {
  const diagram = store.engine?.toExportJSONv2();
  void store.exportSpringBoot(diagram);
}
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 10px;
  height: 100%;
  padding: 0 10px 10px 0;
}

.left,
.right {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 8px;
  background: #242424;
}

.center {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.quick-card {
  border: 1px solid #686868;
  border-radius: 8px;
  padding: 8px 12px;
  background: #242424;
}

.quick-card h2 {
  color: #f5f5f5;
  font-size: 19px;
  margin: 0 0 8px;
}

.quick-buttons {
  display: flex;
  gap: 8px;
}

.quick-buttons button {
  padding: 8px 14px;
  color: #fff;
  background: transparent;
  border: 1px solid #aaa;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
}

.quick-buttons button:hover {
  background: #333;
}

@media (max-width: 1000px) {
  .layout { grid-template-columns: 1fr; padding: 10px; }
  .right { min-height: 420px; }
}

@media (max-width: 600px) {
  .quick-actions { grid-template-columns: 1fr; }
}
</style>
