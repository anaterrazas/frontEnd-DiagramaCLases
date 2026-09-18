<template>
  <nav class="navbar">
    <!-- Botón hamburguesa: solo visible en móviles -->
    <button class="menu-btn mobile-only" @click="$emit('toggleSidebar')">
      <i class="fas fa-bars"></i>
    </button>

    <!-- Logo -->
    <div class="logo">
      <i class="fa-brands fa-uncharted hide-on-mobile"></i>
      <span class="logo-text">APEX</span>
    </div>

    <!-- Acciones a la derecha -->
    <div class="actions">
      <!-- Íconos ocultos en móvil -->
      <!--<button class="icon-btn hide-on-mobile" title="Mensajes">-->
      <!--  <i class="fas fa-comment-dots"></i>-->
      <!-- </button>-->
      <!-- <button class="icon-btn hide-on-mobile" title="Ayuda">-->
      <!--  <i class="fas fa-question-circle"></i>-->
      <!-- </button>-->
      <!--<button class="icon-btn hide-on-mobile" title="Notificaciones">-->
      <!-- <i class="fas fa-bell"></i>-->
      <!-- </button>-->

      <!-- Avatar y dropdown -->
      <div class="avatar-wrapper" @click="toggleMenu">
        <img
          class="avatar"
          src="https://i.pravatar.cc/40"
          alt="Usuario"
          title="Perfil"
        />
        <div
          :class="['dropdown', { 'dropdown-visible': menuOpen }]"
          @click.stop
        >
          <ul>
            <li><i class="fas fa-user"></i> Perfil</li>
            <li><i class="fas fa-cog"></i> Configuración</li>
            <li @click="handleLogout">
              <i class="fas fa-sign-out-alt"></i> Cerrar sesión
            </li>
          </ul>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useAuthStore } from "@/modules/auth/store/authStore";
import { useRouter } from "vue-router";
const menuOpen = ref(false);

const authStore = useAuthStore();
const router = useRouter();

function handleLogout() {
  authStore.logout();
  router.push("/sign-in"); // Redirige al login después de cerrar sesión
}

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value;
};

const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest(".avatar-wrapper")) {
    menuOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 1rem;
  background-color: #fff;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.menu-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #333;
  cursor: pointer;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  font-size: 1.1rem;
  color: #083344;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.icon-btn {
  background: none;
  border: none;
  font-size: 1.3rem;
  color: #333;
  cursor: pointer;
}

.avatar-wrapper {
  position: relative;
  cursor: pointer;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #ccc;
}

/* Dropdown oculto por defecto */
.dropdown {
  position: absolute;
  top: 48px;
  right: 0;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  z-index: 2000;
  min-width: 160px;

  /* Animación */
  opacity: 0;
  transform: translateY(-10px);
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
  pointer-events: none;
  visibility: hidden;
}

/* Dropdown visible con animación */
.dropdown-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  visibility: visible;
}

.dropdown ul {
  list-style: none;
  padding: 0.5rem 0;
  margin: 0;
}

.dropdown li {
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.2s;
}

.dropdown li:hover {
  background-color: #f2f2f2;
}

.hide-on-mobile {
  display: inline-flex;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .hide-on-mobile {
    display: none !important;
  }

  .mobile-only {
    display: inline-flex;
  }

  .dropdown {
    right: -5px;
    top: 56px;
  }
}
</style>
