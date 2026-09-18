<template>
  <div class="snackbar-container">
    <div v-for="item in snackbar.queue" :key="item.id" :class="['snackbar', item.color]">
      <i :class="['fa-solid', getIconClass(item.color), 'icon']"></i>
      {{ item.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSnackbarStore } from '@/store/snackbarStore'

const snackbar = useSnackbarStore()

function getIconClass(color: string) {
  switch (color) {
    case 'success':
      return 'fa-circle-check'
    case 'error':
      return 'fa-circle-xmark'
    case 'warning':
      return 'fa-triangle-exclamation'
    default:
      return 'fa-circle-info'
  }
}
</script>


<style scoped>
.snackbar .icon {
  margin-right: 0.6rem;
  font-size: 1.1rem;
  vertical-align: middle;
}
 
.snackbar-container {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.snackbar {
  font-family: var(--font-family);
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  color: white;
  font-weight: 100;
  font-size: 0.9rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  max-width: 300px;
  word-wrap: break-word;
  line-height: 1.4;
  animation: fadein 0.3s ease;
}

.success {
  background-color: #22c55e;
}

.error {
  background-color: #ef4444;
}

.warning {
  background-color: #f59e0b;
}

@keyframes fadein {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
