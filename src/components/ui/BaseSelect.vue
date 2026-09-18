<!-- BaseSelect.vue -->
<template>
  <BaseFormField :label="label" :error="error" :id="id">
    <select :id="id" v-model="internalValue" @change="emitValue">
      <option disabled value="">Seleccione una opción</option>
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </BaseFormField>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseFormField from './BaseFormField.vue'

interface OptionItem {
  label: string
  value: string | number
}

const props = defineProps<{
  modelValue: string | number
  label: string
  error?: string
  id: string
  options: OptionItem[]
}>()

const emit = defineEmits(['update:modelValue'])

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

function emitValue(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('update:modelValue', target.value)
}
</script>

<style scoped>
select {
  padding: 0.75rem;
  width: 100%;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 1rem;
}
</style>
