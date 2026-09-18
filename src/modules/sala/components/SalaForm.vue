<template>
  <form @submit.prevent="onSubmit" class="form">
    <BaseInput v-model="titulo" id="titulo" label="Título" placeholder="Ej: Sala de Reuniones" :error="errors.titulo"
      type="text" required />

    <BaseInput v-model="descripcion" id="descripcion" label="Descripción" placeholder="Breve descripción"
      :error="errors.descripcion" type="text" />

    <div class="footer">
      <BaseButton variant="secondary" :disabled="loading" text="Cancelar" @click="$emit('cancel')" />
      <BaseButton type="submit" :loading="loading" :text="submitText" icon="fas fa-plus" icon-position="right" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

type SalaFormPayload = { id?: number; titulo: string; descripcion?: string }

const props = defineProps<{
  modelValue?: SalaFormPayload | null
  loading?: boolean
  mode?: 'create' | 'edit'
}>()

const emit = defineEmits<{
  (e: 'submit', payload: SalaFormPayload): void
  (e: 'cancel'): void
}>()

const titulo = ref('')
const descripcion = ref('')

watch(() => props.modelValue, (v) => {
  titulo.value = v?.titulo ?? ''
  descripcion.value = v?.descripcion ?? ''
}, { immediate: true })

const errors = ref<{ titulo?: string; descripcion?: string }>({})
const loading = computed(() => !!props.loading)
const submitText = computed(() => props.mode === 'edit' ? 'Guardar cambios' : 'Crear')

function validate() {
  errors.value = {}
  if (!titulo.value.trim()) errors.value.titulo = 'El título es obligatorio'
  return Object.keys(errors.value).length === 0
}

function onSubmit() {
  if (!validate()) return
  emit('submit', {
    id: props.modelValue?.id,                  // 👈 number | undefined
    titulo: titulo.value.trim(),
    descripcion: descripcion.value.trim()
  })
}
</script>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: .5rem;
  margin-top: .5rem;
}
</style>
