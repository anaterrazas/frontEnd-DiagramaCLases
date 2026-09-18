<!-- src/views/NotFound.vue -->
<template>
  <div class="not-found">
    <h1>404</h1>
    <p>Página no encontrada</p>
    <button @click="goBack">Volver atrás</button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
const goBack = () => router.back()
</script>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 70vh;
  text-align: center;
}

.not-found h1 {
  font-size: 6rem;
  color: #4f46e5;
  margin-bottom: 1rem;
}

.not-found button {
  margin-top: 1rem;
  padding: 0.5rem 1.2rem;
  background-color: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}

.not-found button:hover {
  background-color: #4338ca;
}
</style>
