<template>
  <button
    :type="type"
    :class="['base-button', variant]"
    :disabled="loading || disabled"
    @click="$emit('click')"
  >
    <!-- Spinner centrado cuando está cargando -->
    <span v-if="loading" class="spinner" />

    <!-- Contenido oculto visualmente pero mantiene el espacio -->
    <span class="content-wrapper" :style="{ visibility: loading ? 'hidden' : 'visible' }">
      <span v-if="icon && iconPosition === 'left'" class="button-icon">
        <i :class="icon" />
      </span>

      <span class="button-text">
        <slot>{{ text }}</slot>
      </span>

      <span v-if="icon && iconPosition === 'right'" class="button-icon">
        <i :class="icon" />
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
import {  PropType } from 'vue'

defineProps({
  text: { type: String, default: '' },
  variant: { type: String, default: 'primary' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  icon: { type: String, default: '' }, // Ej: 'fas fa-check'
  iconPosition: {
    type: String as PropType<'left' | 'right'>,
    default: 'left'
  },
  type: {
    type: String as PropType<'button' | 'submit' | 'reset'>,
    default: 'button'
  }
})

defineEmits(['click'])
</script>

<style scoped>
.base-button {
  position: relative;
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 8px;
  font-weight: 550;
  cursor: pointer;
  transition: background 0.2s ease-in-out;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: var(--font-family);
  font-size: 1rem;
  text-align: center;
  min-width: 140px; /* ✅ opcional: evita que se achique */
  height: 40px;     /* ✅ altura fija opcional */
}

.base-button.primary {
  background-color: #3b82f6;
  color: white;
}
.base-button.primary:hover {
  background-color: #2563eb;
}
.base-button[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.button-icon {
  display: inline-flex;
  align-items: center;
}
.button-icon i {
  font-size: 1rem;
}

.button-text {
  white-space: nowrap;
}

/* ✅ Contenido ocultable manteniendo el espacio */
.content-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

/* ✅ Spinner centrado */
.spinner {
  position: absolute;
  width: 1rem;
  height: 1rem;
  border: 2px solid white;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
