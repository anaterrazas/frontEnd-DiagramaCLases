<!-- BaseModal.vue -->
<template>
  <teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content" @click.stop>
        <slot />
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
defineProps({ show: Boolean })
defineEmits(['close'])
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  display: flex;
  align-items: center;
  justify-content: center;
  /* súbelo por encima de tu sidebar/header */
  z-index: 5000; /* o 9999 si hace falta */
}
.modal-content {
  background: #fff;
  padding: 2rem;
  border-radius: 12px;
  max-width: 500px;
  width: 100%;
}
</style>
