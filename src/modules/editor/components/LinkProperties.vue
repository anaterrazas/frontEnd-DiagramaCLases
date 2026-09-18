<template>
  <div>
    <h3>Propiedades de relación</h3>

    <label
      >Nombre
      <input v-model="relName" placeholder="(opcional)" />
    </label>

    <fieldset :disabled="isMultiplicityDisabled" class="fieldset">
      <legend>Multiplicidad</legend>

      <div class="grid-2">
        <label
          >Origen ({{ srcName }})
          <div class="row">
            <input
              v-model="relSrc"
              list="multiplicity-presets"
              placeholder="vacío = sin etiqueta"
            />
            <button
              type="button"
              class="icon"
              title="Quitar"
              @click="relSrc = ''"
            >
              ✕
            </button>
          </div>
        </label>

        <label
          >Destino ({{ tgtName }})
          <div class="row">
            <input
              v-model="relTgt"
              list="multiplicity-presets"
              placeholder="vacío = sin etiqueta"
            />
            <button
              type="button"
              class="icon"
              title="Quitar"
              @click="relTgt = ''"
            >
              ✕
            </button>
          </div>
        </label>
      </div>

      <datalist id="multiplicity-presets">
        <option v-for="opt in multiplicityOpts" :key="opt" :value="opt" />
      </datalist>

      <p class="hint">
        <template v-if="isMultiplicityDisabled">
          En <strong>generalización</strong> y <strong>dependencia</strong> no
          se usan multiplicidades.
        </template>
        <template v-else>
          El campo acepta valores libres (ej. <code>2..5</code>) o puede quedar
          vacío.
        </template>
      </p>
    </fieldset>

    <div class="actions">
      <button @click="applyLink" :disabled="!linkHasChanges">Aplicar</button>
      <button class="secondary" v-if="linkHasChanges" @click="resetLink">
        Descartar
      </button>
      <button class="danger" v-if="hasLink" @click="deleteCurrent">
        Eliminar relación
      </button>
    </div>

    <!-- 👇 Mostramos 'Associate class' si el enlace cuelga de una clase asociativa -->
    <p class="hint">
      Tipo: <strong>{{ kindLabel }}</strong>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useEditorStore } from "@/modules/editor/store/editor.store";

const store = useEditorStore();

const hasLink = computed(
  () => store.selected.kind === "link" && !!store.selected.id && !!store.engine,
);

const link = computed(() =>
  hasLink.value ? store.engine!.model.links[store.selected.id as string] : null,
);

const relName = ref("");
const relSrc = ref("");
const relTgt = ref("");
const multiplicityOpts = ["0..1", "1", "0..*", "1..*", "*"] as const;

const kind = computed(() => link.value?.kind ?? "Associate");
const isMultiplicityDisabled = computed(
  () => kind.value === "Generalize" || kind.value === "Dependency",
);

const kindLabel = computed(() => {
  if (!link.value) return "";
  return link.value.assocClassId ? "Associate class" : link.value.kind;
});

const srcName = computed(() => {
  if (!link.value || !store.engine) return "Origen";
  const n = store.engine.model.classes[link.value.sourceId];
  return n?.name || "Origen";
});
const tgtName = computed(() => {
  if (!link.value || !store.engine) return "Destino";
  const n = store.engine.model.classes[link.value.targetId];
  return n?.name || "Destino";
});

watch(() => store.selected.id, loadFromSelection, { immediate: true });

function loadFromSelection() {
  if (!hasLink.value) {
    relName.value = relSrc.value = relTgt.value = "";
    return;
  }
  const l = link.value!;
  relName.value = l.labels?.name || "";
  relSrc.value = l.labels?.src || "";
  relTgt.value = l.labels?.tgt || "";
}

/** Si cambia a un tipo sin multiplicidades, limpiamos los inputs locales */
watch(kind, (k) => {
  if (k === "Generalize" || k === "Dependency") {
    relSrc.value = "";
    relTgt.value = "";
  }
});

const linkHasChanges = computed(() => {
  if (!hasLink.value) return false;
  const l = link.value!;
  return (
    relName.value !== (l.labels?.name || "") ||
    relSrc.value !== (l.labels?.src || "") ||
    relTgt.value !== (l.labels?.tgt || "")
  );
});

function applyLink() {
  if (!hasLink.value || !store.engine) return;
  const id = store.selected.id as string;

  // Evita etiquetas fantasma cuando el tipo no las admite
  const labels = isMultiplicityDisabled.value
    ? {
        name: relName.value.trim() || undefined,
        src: undefined,
        tgt: undefined,
      }
    : {
        name: relName.value.trim() || undefined,
        src: relSrc.value.trim() || undefined,
        tgt: relTgt.value.trim() || undefined,
      };

  store.engine.updateLink(id, { labels });
}

function resetLink() {
  loadFromSelection();
}

function deleteCurrent() {
  if (!hasLink.value || !store.engine) return;
  const id = store.selected.id as string;
  store.engine.deleteLink(id);
  store.setSelected(null, null);
}
</script>

<style scoped>
label {
  display: block;
  margin: 10px 0;
}

input,
select {
  width: 100%;
  padding: 6px 8px;
}

.fieldset {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 8px 10px;
  margin-top: 8px;
}

legend {
  font-size: 12px;
  color: #666;
  padding: 0 4px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

button {
  padding: 6px 10px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}

button.secondary {
  background: #f6f6f6;
}

button.danger {
  background: #fef2f2;
  border-color: #fecaca;
}

.hint {
  font-size: 12px;
  color: #a31111;
  margin-top: 8px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.row {
  display: flex;
  gap: 6px;
  align-items: center;
}

@media (max-width: 520px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
