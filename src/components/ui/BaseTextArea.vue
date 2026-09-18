<!-- BaseTextArea.vue -->
<template>
  <BaseFormField :label="label" :error="error" :id="id">
    <textarea
      :id="id"
      v-model="modelValue"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', modelValue)"
    />
  </BaseFormField>
</template>

<script setup lang="ts">
import BaseFormField from './BaseFormField.vue'

defineProps({
  modelValue: String,
  label: String,
  error: String,
  id: String,
  placeholder: String,
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
textarea {
  padding: 0.75rem;
  width: 100%;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 1rem;
  resize: vertical;
  min-height: 80px;
}
</style>