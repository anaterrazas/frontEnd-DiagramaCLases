<template>
  <div class="layout-wrapper">
    <Navbar @toggleSidebar="toggleSidebar" />

    <div class="layout-body">
      <Sidebar :isOpen="isSidebarVisible" @close="isSidebarVisible = false" />

      <main class="main-content">
        <router-view />
      </main>
    </div>

    <!-- Fondo oscuro en móvil -->
    <div
      v-if="isSidebarVisible && isMobile"
      class="overlay"
      @click="isSidebarVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import Navbar from "@/components/Navbar.vue";
import Sidebar from "@/components/Sidebar.vue";

const isMobile = ref(window.innerWidth < 768);
const isSidebarVisible = ref(!isMobile.value);

const handleResize = () => {
  isMobile.value = window.innerWidth < 768;
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

watch(isMobile, (newVal) => {
  isSidebarVisible.value = !newVal;
});

const toggleSidebar = () => {
  isSidebarVisible.value = !isSidebarVisible.value;
};
</script>

<style scoped>
.layout-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #242424;
}

.layout-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  position: relative;
  z-index: 0;
  background-color: #242424;
}

/* Si BasePage ya aplica padding, puedes eliminarlo aquí */
.main-content > * {
  height: 100%;
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.3);
  z-index: 900;
}
</style>
