<!-- src/modules/userSala/pages/ShareJoin.vue -->
<template>
  <div style="padding:1rem; text-align:center;">Procesando acceso a la sala…</div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserSalaStore } from '@/modules/userSala/store/userSalaStore'
import { notify } from '@/utils/snackbar'
const userSalaStore = useUserSalaStore()
const route = useRoute()
const router = useRouter()

onMounted(async () => {
  const salaId = Number(route.params.salaId)

  try {
    // Da acceso en backend usando TU endpoint actual
    await userSalaStore.share(salaId)
    notify('Acceso concedido a la sala')
  } catch (e: any) {
    console.error(e)
    notify('No se pudo acceder a la sala')
  } finally {
    // Redirige a la lista de compartidas
    router.replace({ name: 'SalasCompartidas' })
  }
})
</script>
