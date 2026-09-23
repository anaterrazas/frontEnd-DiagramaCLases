<template>
  <div class="panel">
    <template v-if="isClass">
      <ClassProperties />
    </template>
    <template v-else-if="isLink">
      <LinkProperties />
    </template>
    <template v-else
      ><em>Selecciona una tabla o una relación para editar.</em></template
    >
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useEditorStore } from "@/modules/editor/store/editor.store";
import ClassProperties from "@/modules/editor/components/ClassProperties.vue";
import LinkProperties from "@/modules/editor/components/LinkProperties.vue";

const store = useEditorStore();
const isClass = computed(() => store.selected.kind === "class");
const isLink = computed(() => store.selected.kind === "link");
</script>

<style scoped>
.panel {
  height: 100%;
  border-left: 1px solid #686868;
  padding: 22px;
  min-width: 320px;
  color: #f5f5f5;
  background: #242424;
}
</style>
