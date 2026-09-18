<template>
  <div class="form-group">
    <label v-if="label" :for="id" class="form-label">{{ label }}</label>
    <slot />
    <span v-if="error" class="error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps({
  label: String,
  id: String,
  error: String,
})

</script>

<style scoped>
.form-group {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  font-family: var(--font-family);
}

.form-label {
  margin-bottom: 0.5rem;
  font-weight: 500;
  font-size: 0.95rem;
  color: #111827;
}

/* Input base */
::v-deep(input) {
  padding: 0.6rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 20px;
  font-size: 1rem;
  font-family: var(--font-family);
  transition: all 0.3s ease;
  background-color: white;
  width: 100%;
}

/* Focus normal */
::v-deep(input.input-focus) {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
  outline: none;
}

/* Solo error */
::v-deep(input.input-error) {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.3);
}

/* Error + focus (tiene prioridad visual) */
::v-deep(input.input-error.input-focus) {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
}

/* Texto de error */
.error {
  color: #ef4444;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}
</style>
