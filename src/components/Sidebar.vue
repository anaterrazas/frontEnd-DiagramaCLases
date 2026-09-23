<template>
  <aside
    :class="[
      'sidebar',
      {
        collapsed,
        mobile: isMobile,
        'show-mobile': isMobile && isOpen,
        'hide-mobile': isMobile && !isOpen,
      },
    ]"
  >
    <ul class="menu">
      <li
        v-for="item in items"
        :key="item.text"
        :class="{ active: item.route === currentRoute }"
      >
        <router-link :to="item.route" class="menu-item" @click="$emit('close')">
          <i :class="item.icon"></i>
          <span v-if="!collapsed || isMobile">{{ item.text }}</span>
        </router-link>
      </li>
    </ul>
    <br />
    <Palette />
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import Palette from "@/modules/editor/components/Palette.vue";
import { useRoute } from "vue-router";

const props = defineProps<{
  isOpen: boolean;
}>();

const collapsed = ref(false);
const isMobile = ref(window.innerWidth < 768);

const updateScreen = () => {
  const screenWidth = window.screen.width;
  const currentWidth = window.innerWidth;
  isMobile.value = currentWidth < 768;
  collapsed.value = currentWidth < screenWidth * 0.7 && !isMobile.value;
};

onMounted(() => {
  updateScreen();
  window.addEventListener("resize", updateScreen);
});
onUnmounted(() => window.removeEventListener("resize", updateScreen));

const route = useRoute();
const currentRoute = computed(() => route.path);

const items = [
  { text: "Salas", icon: "fa fa-box", route: "/salas" },
  {
    text: "Salas Compartidas",
    icon: "fa fa-home",
    route: "/salas-compartidas",
  },
  /*   { text: 'Ventas', icon: 'fa fa-chart-line', route: '/ventas' },
    { text: 'Cartera', icon: 'fa fa-wallet', route: '/cartera' },
    { text: 'Informes', icon: 'fa fa-chart-pie', route: '/informes' },
    { text: 'Herramientas', icon: 'fa fa-wrench', route: '/herramientas' }, */
];
</script>

<style scoped>
.sidebar {
  background-color: #242424;
  color: #f5f5f5;
  width: 282px;
  min-height: 100vh;
  padding: 1rem 0.5rem;
  border-right: 1px solid #686868;
  z-index: 1000;
  transition:
    transform 0.3s ease,
    width 0.3s ease;
}

/* Escritorio colapsado */
.sidebar.collapsed {
  width: 80px;
}

/* Modo móvil base */
.sidebar.mobile {
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  transform: translateX(-100%);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s ease;
}

/* Mostrar con animación */
.sidebar.show-mobile {
  transform: translateX(0);
}

/* Ocultar con animación */
.sidebar.hide-mobile {
  transform: translateX(-100%);
}

/* Menú */
.menu {
  list-style: none;
  padding: 0;
  margin: 0;
}

.menu-item {
  font-family: var(--font-sidebar);
  display: flex;
  align-items: center;
  padding: 0.8rem 1rem;
  color: #f5f5f5;
  gap: 1rem;
  text-decoration: none;
  border-radius: 6px;
  transition: background 0.2s;
}

.menu-item:hover {
  background-color: #333;
}

.active .menu-item {
  background-color: #333;
  color: #fff;
}

/* Centrado cuando está colapsado */
.sidebar.collapsed .menu-item {
  justify-content: center;
  padding: 0.8rem;
}
</style>
