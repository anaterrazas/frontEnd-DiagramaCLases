<template>
  <BasePage>
    <BaseButton variant="primary" icon="fas fa-plus" icon-position="left" text="Agregar" @click="openCreate" />

    <h2 class="page-title">Mis Salas</h2>

    <div v-if="salaStore.loading" class="text-center text-gray-500">Cargando salas...</div>
    <div v-else-if="salaStore.salas.length === 0" class="text-center text-gray-400">
      No hay salas registradas.
    </div>

    <div v-else class="sala-grid">
      <SalaCard v-for="sala in salaStore.salas" :key="sala.id" :sala="sala" @view="verSala" @edit="openEdit(sala)"
        @delete="eliminarSala(sala)" @share="compartirSala(sala)" />
    </div>

    <!-- Modal CRUD -->
    <BaseModal :show="showModal" @close="closeModal">
      <h3 style="margin:0 0 .75rem 0;">
        {{ mode === 'edit' ? 'Editar sala' : 'Crear sala' }}
      </h3>

      <SalaForm :key="mode + '-' + (currentSala?.id ?? 'new')" :model-value="currentSala" :loading="submitting"
        :mode="mode" @submit="handleSubmit" @cancel="closeModal" />
    </BaseModal>

    <!-- Modal de confirmación de eliminación -->
    <BaseModal :show="confirmOpen" @close="closeConfirm">
      <h3 style="margin:0 0 .75rem 0;">Eliminar sala</h3>
      <p style="margin:0 0 1rem 0;">
        ¿Seguro que deseas eliminar
        <strong>“{{ nombreSalaAEliminar }}”</strong>?
        Esta acción no se puede deshacer.
      </p>

      <div class="confirm-actions">
        <button class="btn cancel" @click="closeConfirm" :disabled="deleting">Cancelar</button>
        <button class="btn delete" @click="confirmDelete" :disabled="deleting">
          <i class="fas fa-trash-alt"></i>
          {{ deleting ? 'Eliminando…' : 'Eliminar' }}
        </button>
      </div>
    </BaseModal>
  </BasePage>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import BasePage from '@/components/BasePage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import SalaCard from '@/modules/sala/components/SalaCard.vue'
import SalaForm from '@/modules/sala/components/SalaForm.vue'
import { useSalaStore } from '@/modules/sala/store/salaStore'
import { notify } from '@/utils/snackbar'

const router = useRouter()

/** Tipos */
type SalaAny = {
  id: number
  titulo?: string
  title?: string
  descripcion?: string
  description?: string
}

type SalaFormPayload = {
  id?: number
  titulo: string
  descripcion?: string
}

const salaStore = useSalaStore()

const showModal = ref(false)
const submitting = ref(false)
const mode = ref<'create' | 'edit'>('create')
const currentSala = ref<SalaFormPayload | null>(null)

// ---- Confirm delete ----
const confirmOpen = ref(false)
const deleting = ref(false)
const salaToDelete = ref<SalaAny | null>(null)
const nombreSalaAEliminar = computed(() => salaToDelete.value?.titulo ?? salaToDelete.value?.title ?? '')

onMounted(() => {
  salaStore.getSalas()
})

function openCreate() {
  mode.value = 'create'
  currentSala.value = { titulo: '', descripcion: '' }
  showModal.value = true
}

function openEdit(sala: SalaAny) {
  mode.value = 'edit'
  currentSala.value = {
    id: sala.id,
    titulo: sala.titulo ?? sala.title ?? '',
    descripcion: sala.descripcion ?? sala.description ?? ''
  }
  showModal.value = true
}

function closeModal() {
  if (submitting.value) return
  showModal.value = false
  currentSala.value = null
}

async function handleSubmit(payload: SalaFormPayload) {
  let ok = false
  try {
    submitting.value = true
    if (mode.value === 'edit') {
      if (payload.id == null) throw new Error('Falta id')
      await salaStore.updateSala(payload.id, payload.titulo, payload.descripcion ?? '')
      notify('Sala actualizada')
    } else {
      await salaStore.createSala(payload.titulo, payload.descripcion ?? '')
      notify('Sala creada exitosamente')
    }
    await salaStore.getSalas()
    ok = true
  } catch (e) {
    console.error(e)
  } finally {
    submitting.value = false
    if (ok) closeModal()
  }
}

// Navegar al editor
function verSala(sala: SalaAny) {
  router.push({ name: 'SalaEditor', params: { salaId: sala.id } })
}

// Abrir modal de confirmación
function eliminarSala(sala: SalaAny) {
  salaToDelete.value = sala
  confirmOpen.value = true
}

function closeConfirm() {
  if (deleting.value) return
  confirmOpen.value = false
  salaToDelete.value = null
}

async function confirmDelete() {
  if (!salaToDelete.value) return
  try {
    deleting.value = true
    await salaStore.deleteSala(salaToDelete.value.id)
    notify('Sala eliminada')
    await salaStore.getSalas()
  } catch (e) {
    console.error(e)
    notify('No se pudo eliminar la sala')
  } finally {
    deleting.value = false
    closeConfirm()
  }
}

/** ------------------ COMPARTIR: copiar link ------------------ **/
async function compartirSala(sala: { id: number }) {
  // Genera la URL absoluta a la ruta ShareJoin usando el router (evita hardcodear host)
  const { href } = router.resolve({ name: 'ShareJoin', params: { salaId: sala.id } })
  const url = new URL(href, window.location.origin).toString()

  try {
    await copyToClipboard(url)
    notify('Enlace copiado al portapapeles')
  } catch (e) {
    console.error(e)
    notify('No se pudo copiar el enlace')
  }
}

// util con fallback
async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  // Fallback para contextos inseguros o navegadores viejos
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  if (!ok) throw new Error('execCommand copy failed')
}
</script>

<style scoped>
.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  text-align: center;
}

.sala-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

/* Botones del modal de confirmación */
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: .5rem;
  margin-top: 1rem;
}

.btn {
  padding: .45rem .9rem;
  border: none;
  border-radius: 6px;
  font-size: .9rem;
  cursor: pointer;
}

.btn.cancel {
  background: #ecf0f1;
  color: #2c3e50;
}

.btn.delete {
  background: #e74c3c;
  color: #fff;
}

.btn.delete:disabled,
.btn.cancel:disabled {
  opacity: .7;
  cursor: not-allowed;
}
</style>
