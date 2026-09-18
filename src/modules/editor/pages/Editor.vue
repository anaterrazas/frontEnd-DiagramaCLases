<template>
  <div class="layout">
    <main class="center">
      <CanvasEditor />
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
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 1fr 0fr 20px;
  gap: 12px;
}

.left,
.right {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 8px;
  background: #b69ea8;
}

.center {
  min-width: 0;
}
</style>
