<script setup lang="ts">
import { ref, getCurrentInstance, onMounted } from 'vue'
import Snackbar from '@/components/Snackbar.vue'

const snackbarRef = ref()

onMounted(() => {
  const app = getCurrentInstance()
  if (app) {
    app.appContext.config.globalProperties.$snackbar = snackbarRef.value
  }
})
</script>

<template>
  <router-view />
  <Snackbar ref="snackbarRef" />
</template>
