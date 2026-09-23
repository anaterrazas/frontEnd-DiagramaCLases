<template>
  <div>
    <h3>Propiedades de tabla</h3>

    <label>Nombre
      <input v-model="name" />
    </label>

    <!-- ========== ATRIBUTOS ========== -->
    <section class="section">
      <div class="section-header">
        <h4>Atributos</h4>
        <button type="button" class="small" @click="addAttr">+ Agregar atributo</button>
      </div>

      <div class="grid-attrs">
        <div class="grid-nt-head">Vis.</div>
        <div class="grid-nt-head">Nombre</div>
        <div class="grid-nt-head">Tipo</div>
        <div class="grid-nt-head"></div>

        <template v-for="(r, i) in attrRows" :key="r.id || 'attr-' + i">
          <!-- Visibilidad -->
          <select v-model="r.vis">
            <option value="+">+</option>
            <option value="-">-</option>
            <option value="#">#</option>
            <option value="~">~</option>
          </select>

          <!-- Nombre -->
          <input
            v-model="r.name"
            placeholder="id"
            @keydown.enter.prevent="enterAddsRow(i, 'attr')"
          />

          <!-- Tipo -->
          <select v-model="r.type" @keydown.enter.prevent="enterAddsRow(i, 'attr')">
            <option v-for="t in TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option>
          </select>

          <!-- Acciones -->
          <div class="row-actions">
            <button type="button" class="icon" @click="removeAttr(i)" aria-label="Eliminar">✕</button>
          </div>
        </template>
      </div>
    </section>

    <!-- ========== MÉTODOS ========== -->
    <section class="section">
      <div class="section-header">
        <h4>Métodos</h4>
        <button type="button" class="small" @click="addMeth">+ Agregar método</button>
      </div>

      <div class="grid-nt">
        <div class="grid-nt-head">Nombre</div>
        <div class="grid-nt-head">Retorno</div>
        <div class="grid-nt-head"></div>

        <template v-for="(m, i) in methRows" :key="m.id || 'meth-' + i">
          <input v-model="m.name" placeholder="save" @keydown.enter.prevent="enterAddsRow(i, 'meth')" />
          <input v-model="m.ret" placeholder="void" @keydown.enter.prevent="enterAddsRow(i, 'meth')" />
          <div class="row-actions">
            <button type="button" class="icon" @click="removeMeth(i)" aria-label="Eliminar">✕</button>
          </div>
        </template>
      </div>
    </section>

    <div class="actions">
      <button @click="applyClass" :disabled="!classHasChanges">Aplicar</button>
      <button class="secondary" @click="resetClass" v-if="classHasChanges">Descartar</button>
      <button class="danger" @click="removeClass">Eliminar tabla</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEditorStore } from '@/modules/editor/store/editor.store'

// Mantén tus helpers de MÉTODOS
import { parseMethodLine, stringifyMethod } from '@/modules/editor/utils/uml-format'

// ================== Tipos locales (UML clásico) ==================
type Visibility = '+' | '-' | '#' | '~'
type AttrRow = { vis: Visibility; name: string; type: string }
type MethRow = { name: string; ret: string }

// Tipos disponibles para el SELECT (puedes ajustar la lista)
const TYPE_OPTIONS = [
  'int','bigint','float','double','decimal',
  'string','text','bool',
  'date','time','datetime',
  'uuid','json'
] as const

// ================== Helpers de ATRIBUTOS con visibilidad ==================
// Soportan: "+ nombre : Tipo", "-password: string", "edad: int", "nombre" (default string)
function parseAttrLineWithVis(s: string): AttrRow {
  const t = (s || '').trim()
  if (!t) return { vis: '+', name: '', type: 'string' }

  let vis: Visibility = '+'
  let rest = t

  // vis opcional al inicio
  if (/^[+\-#~]\s/.test(rest)) {
    vis = rest[0] as Visibility
    rest = rest.slice(1).trim()
  }

  // name [: type]
  const i = rest.lastIndexOf(':')
  if (i === -1) {
    // sin tipo -> default string
    return { vis, name: rest, type: 'string' }
  }
  const name = rest.slice(0, i).trim()
  const type = rest.slice(i + 1).trim() || 'string'
  return { vis, name, type }
}

function stringifyAttrWithVis(r: AttrRow) {
  const v = (r.vis || '+').trim() as Visibility
  const n = (r.name || '').trim()
  const t = (r.type || '').trim()
  if (!n) return ''
  // UML clásico: "[vis] nombre : Tipo"
  return `${v} ${n}${t ? `: ${t}` : ''}`
}

// ================== Estado y store ==================
const store = useEditorStore()
const hasClassSelected = computed(() => store.selected.kind === 'class' && !!store.selected.id)

const name = ref('')
const attrRows = ref<AttrRow[]>([])
const methRows = ref<MethRow[]>([])

watch(() => store.selected.id, () => { loadFromSelection() }, { immediate: true })

function loadFromSelection() {
  if (!hasClassSelected.value || !store.engine) {
    name.value = ''
    attrRows.value = []
    methRows.value = []
    return
  }
  const c = store.engine.model.classes[store.selected.id as string]
  name.value = c?.name ?? ''
  // Atributos con nuevo parser (visibilidad + tipo + nombre)
  attrRows.value = (c?.attributes ?? []).map(parseAttrLineWithVis)
  // Métodos igual que antes
  methRows.value = (c?.methods ?? []).map(parseMethodLine)
}

const classHasChanges = computed(() => {
  if (!hasClassSelected.value || !store.engine) return false
  const c = store.engine.model.classes[store.selected.id as string]
  const curName = c?.name ?? ''
  const curAttrs = (c?.attributes ?? []).join('\n')
  const curMethods = (c?.methods ?? []).join('\n')

  const nextAttrs = attrRows.value.map(stringifyAttrWithVis).filter(Boolean).join('\n')
  const nextMethods = methRows.value.map(stringifyMethod).filter(Boolean).join('\n')

  return name.value !== curName || nextAttrs !== curAttrs || nextMethods !== curMethods
})

function applyClass() {
  if (!hasClassSelected.value || !store.engine) return
  const id = store.selected.id as string
  const attrs = attrRows.value.map(stringifyAttrWithVis).filter(Boolean) // ← strings para el engine
  const methods = methRows.value.map(stringifyMethod).filter(Boolean)
  const newName = name.value?.trim() || 'Tabla'
  store.engine.updateClass(id, { name: newName, attributes: attrs, methods })
}

function resetClass() { loadFromSelection() }

function removeClass() {
  if (!store.engine || !hasClassSelected.value) return
  const ok = window.confirm('¿Eliminar esta tabla y sus relaciones?')
  if (!ok) return
  const id = store.selected.id as string
  store.engine.deleteClass(id)
  store.setSelected(null, null)
}

// helpers UI
function addAttr() { attrRows.value.push({ vis: '+', name: '', type: 'string' }) }
function removeAttr(i: number) { attrRows.value.splice(i, 1) }
function addMeth() { methRows.value.push({ name: '', ret: '' }) }
function removeMeth(i: number) { methRows.value.splice(i, 1) }
function enterAddsRow(i: number, kind: 'attr' | 'meth') {
  const isLast = kind === 'attr' ? i === attrRows.value.length - 1 : i === methRows.value.length - 1
  if (isLast) (kind === 'attr' ? addAttr() : addMeth())
}
</script>

<style scoped>
label {
  display: block;
  margin: 10px 0;
}

h3 { font-size: 25px; margin: 0 0 18px; }
h4 { color: #f5f5f5; }

input, select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d8dce8;
  border-radius: 2px;
  background: #f4f6ff;
  color: #20242c;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

button {
  padding: 6px 10px;
  border: 1px solid #aaa;
  background: transparent;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
}

button.secondary { background: #333; }
button.danger { color: #ff8888; border-color: #b85e5e; }
button.small { font-size: 12px; padding: 4px 8px; }
button.icon {
  width: 28px; height: 28px; padding: 0;
  display: flex; align-items: center; justify-content: center;
}

.section { margin-top: 14px; }
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.section h4 { margin: 0; font-size: 14px; font-weight: 600; }

/* Atributos: Vis | Nombre | Tipo | Acciones */
.grid-attrs {
  display: grid;
  grid-template-columns: 70px 1fr 1fr auto;
  gap: 6px 8px;
  align-items: center;
}

/* Métodos (igual que tenías) */
.grid-nt {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 6px 8px;
  align-items: center;
}

.grid-nt-head {
  font-size: 12px; color: #ddd; font-weight: 600;
}

.row-actions {
  display: flex; gap: 6px; justify-content: flex-end;
}
</style>
