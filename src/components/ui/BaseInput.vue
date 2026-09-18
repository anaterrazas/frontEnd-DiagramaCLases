<template>
  <BaseFormField
    :label="label"
    :id="id"
    :error="showError && error ? error : ''"
  >
    <input
      :id="id"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      autocapitalize="off"
      spellcheck="false"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      v-bind="$attrs"
      :class="{
        'input-error': showError && error && !isFocused,
        'input-focus': isFocused,
        'input-error input-focus': showError && error && isFocused
      }"
    />
  </BaseFormField>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseFormField from './BaseFormField.vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  error: { type: String, default: '' },
  id: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  autocomplete: { type: String, default: 'off' } // 👈 evita sugerencias
})

const emit = defineEmits(['update:modelValue'])

const isFocused = ref(false)
const showError = ref(true)

function onInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (target) {
    emit('update:modelValue', target.value)
    showError.value = false
  }
}
function onFocus() { isFocused.value = true }
function onBlur()  { isFocused.value = false }

// Si cambia el valor desde el padre, vuelve a mostrar error si corresponde
watch(() => props.modelValue, () => {
  if (props.error) showError.value = true
})
watch(() => props.error, (e) => { if (e) showError.value = true })
</script>
