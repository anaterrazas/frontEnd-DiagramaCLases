<template>
  <BaseCard class="sala-card">
    <template #header>
      <h3 class="sala-title">
        <i class="fas fa-door-open sala-icon"></i>
        {{ sala.title }}
      </h3>
    </template>

    <template #default>
      <div class="sala-info">
        <!-- Fecha (opcional) -->
        <p v-if="sala.createdAt">
          <i class="fas fa-calendar-alt icon"></i>
          <strong>Creada:</strong> {{ formatDate(sala.createdAt) }}
        </p>

        <!-- Estado (opcional) -->
        <p v-if="typeof sala.is_active !== 'undefined'">
          <i class="fas fa-toggle-on icon"></i> <strong>Estado:</strong>
          <span :class="sala.is_active ? 'estado-activo' : 'estado-inactivo'">
            {{ sala.is_active ? 'Activa' : 'Inactiva' }}
          </span>
        </p>

        <!-- Creador (opcional) -->
        <p v-if="sala.creador">
          <i class="fas fa-user icon"></i>
          <strong>Creador:</strong> {{ sala.creador }}
        </p>

        <!-- Descripción (opcional) -->
        <p v-if="sala.description">
          <i class="fas fa-info-circle icon"></i>
          <strong>Descripción:</strong> {{ sala.description }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="sala-actions">
        <button @click="$emit('view', sala)" class="action-btn view">
          <i class="fas fa-eye"></i> Ver
        </button>

        <!-- Editar (opcional) -->
        <button v-if="showEdit" @click="$emit('edit', sala)" class="action-btn edit">
          <i class="fas fa-edit"></i> Editar
        </button>

        <button @click="$emit('delete', sala)" class="action-btn delete">
          <i class="fas fa-trash-alt"></i> Eliminar
        </button>

        <!-- Compartir (opcional) -->
        <button v-if="showShare" @click="$emit('share', sala)" class="action-btn share">
          <i class="fas fa-share-alt"></i> Compartir
        </button>
      </div>
    </template>
  </BaseCard>
</template>

<script setup lang="ts">
import BaseCard from '@/components/ui/BaseCard.vue'

const props = withDefaults(defineProps<{
  sala: any
  /** Mostrar/ocultar botones opcionales */
  showEdit?: boolean
  showShare?: boolean
}>(), {
  showEdit: true,
  showShare: true
})

defineEmits(['view', 'edit', 'delete', 'share'])

function formatDate(date?: string | Date) {
  if (!date) return '-'
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.sala-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}

.sala-title {
  font-size: 1.2rem;
  font-weight: bold;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.sala-icon { color: #6c5ce7; }
.icon { margin-right: 6px; color: #888; }

.estado-activo { color: green; font-weight: bold; }
.estado-inactivo { color: red; font-weight: bold; }

.sala-info {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.95rem;
}

/* Botones */
.sala-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.action-btn {
  flex: 1;
  min-width: 100px;
  padding: 0.5rem 0.8rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.4rem;
  color: white;
  transition: background-color 0.3s ease;
}

.view { background-color: #3498db; }
.view:hover { background-color: #2980b9; }

.edit { background-color: #f1c40f; color: #000; }
.edit:hover { background-color: #d4ac0d; }

.delete { background-color: #e74c3c; }
.delete:hover { background-color: #c0392b; }

.share { background-color: #2ecc71; }
.share:hover { background-color: #27ae60; }

@media (max-width: 600px) {
  .sala-card { padding: 1rem; }
  .sala-title { font-size: 1.1rem; }
  .action-btn { flex: 1 1 auto; justify-content: center; }
}
</style>
