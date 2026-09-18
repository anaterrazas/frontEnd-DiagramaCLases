<template>
  <BasePage>
    <h2 class="page-title">Mis Salas Compartidas</h2>

    <div v-if="userSalaStore.loading" class="text-center text-gray-500">Cargando salas...</div>
    <div v-else-if="userSalaStore.salas.length === 0" class="text-center text-gray-400">
      No hay salas compartidas.
    </div>

    <div v-else class="sala-grid">
      <SalaCard
        v-for="sala in userSalaStore.salas"
        :key="sala.id"
        :sala="sala"
        :show-edit="false"
        :show-share="false"
        @view="verSala"
        @delete="leaveSala(sala)" 
      />
    </div>

    <!-- Modal de confirmación: salir de una sala compartida -->
    <BaseModal :show="confirmOpen" @close="closeConfirm">
      <h3 style="margin:0 0 .75rem 0;">Salir de la sala</h3>
      <p style="margin:0 0 1rem 0;">
        ¿Seguro que deseas dejar de acceder a
        <strong>“{{ nombreSalaADejar }}”</strong>?
      </p>

      <div class="confirm-actions">
        <button class="btn cancel" @click="closeConfirm" :disabled="leaving">Cancelar</button>
        <button class="btn delete" @click="confirmLeave" :disabled="leaving">
          <i class="fas fa-sign-out-alt"></i>
          {{ leaving ? 'Saliendo…' : 'Salir' }}
        </button>
      </div>
    </BaseModal>
  </BasePage>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import BasePage from '@/components/BasePage.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import SalaCard from '@/modules/sala/components/SalaCard.vue'
import { useUserSalaStore } from '@/modules/userSala/store/userSalaStore'
import { notify } from '@/utils/snackbar'

type SalaAny = {
  id: number
  title?: string
  titulo?: string
  description?: string | null
  creador?: string | null
}

const router = useRouter()
const userSalaStore = useUserSalaStore()

// Modal salir
const confirmOpen = ref(false)
const leaving = ref(false)
const salaToLeave = ref<SalaAny | null>(null)
const nombreSalaADejar = computed(() => salaToLeave.value?.titulo ?? salaToLeave.value?.title ?? '')

onMounted(() => {
  userSalaStore.getSalas() // trae SOLO las compartidas
})

function verSala(sala: SalaAny) {
  router.push({ name: 'SalaEditor', params: { salaId: sala.id } })
}

function leaveSala(sala: SalaAny) {
  salaToLeave.value = sala
  confirmOpen.value = true
}

function closeConfirm() {
  if (leaving.value) return
  confirmOpen.value = false
  salaToLeave.value = null
}

async function confirmLeave() {
  if (!salaToLeave.value) return
  try {
    leaving.value = true
    // 🔁 Llama a tu store para desvincular la sala compartida
    // Ajusta el nombre del método según tu store:
    // - userSalaStore.deleteSala(salaId)
    // - userSalaStore.eliminarSalaCompartida(salaId)
    await userSalaStore.delete(salaToLeave.value.id)
    notify('Sala eliminada')
    await userSalaStore.getSalas()
  } catch (e) {
    console.error(e)
  } finally {
    leaving.value = false
    closeConfirm()
  }
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
.btn.cancel { background: #ecf0f1; color: #2c3e50; }
.btn.delete { background: #e74c3c; color: #fff; }
.btn.delete:disabled, .btn.cancel:disabled { opacity: .7; cursor: not-allowed; }
</style>
