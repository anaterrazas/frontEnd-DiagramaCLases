<template>
  <div class="chatbar" :class="{ disabled }">
    <!-- Botón opcional para acciones/adjuntos (lo dejo, pero puedes quitarlo) -->
    <button class="icon-btn left" :disabled="disabled" title="Acciones" @click="$emit('action')">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>

    <!-- Campo de texto -->
    <div class="input-wrap">
      <textarea ref="inputRef" v-model="text" :placeholder="placeholder" :disabled="disabled" rows="1"
        @keydown.enter.exact.prevent="onSend" @keydown.enter.shift.stop @input="onInputResize" />
    </div>

    <!-- Micrófono -->
    <button class="icon-btn" :class="{ rec: isListening }" :disabled="disabled || !isSpeechSupported" @click="toggleSTT"
      :title="isListening ? 'Detener dictado' : 'Dictar voz a texto'">
      <svg v-if="!isListening" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" fill="currentColor" />
        <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" />
        <path d="M12 19v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <div v-else class="waves" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
    </button>

    <!-- Enviar -->
    <button class="icon-btn send-btn" :disabled="disabled || !textTrimmed" @click="onSend" title="Enviar">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M3 11l18-8-8 18-2-7-8-3z" fill="currentColor" />
      </svg>
    </button>
  </div>

  <div v-if="helpMsg || errMsg" class="stt-help">
    <span v-if="helpMsg">⚠️ {{ helpMsg }}</span>
    <span v-else>⚠️ {{ errMsg }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'

/* ===== Types para Web Speech (evita errores TS) ===== */
declare global {
  interface Window {
    webkitSpeechRecognition?: any
    SpeechRecognition?: any
  }
  var webkitSpeechRecognition: { new(): any }
  var SpeechRecognition: { new(): any }
}

/* ===== Props & Emits ===== */
const props = withDefaults(defineProps<{
  placeholder?: string
  lang?: string
  autoPunctuation?: boolean
  disabled?: boolean
}>(), {
  placeholder: 'Escribe o dicta tu prompt…',
  lang: 'es-ES',
  autoPunctuation: true,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'send', payload: string): void
  (e: 'action'): void  // opcional (botón '+')
}>()

/* ===== Estado ===== */
const text = ref('')
const textTrimmed = computed(() => text.value.trim().length > 0)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const disabled = computed(() => !!props.disabled)

/* ===== Speech to Text básico ===== */
const Rec: any = window.SpeechRecognition || window.webkitSpeechRecognition
const isSpeechSupported = !!Rec
const isListening = ref(false)
const errMsg = ref<string | null>(null)
const helpMsg = ref<string | null>(!isSpeechSupported
  ? 'Este navegador no soporta Web Speech API. Usa Chrome/Edge y https (o localhost).'
  : null)

let rec: any = null
let interim = ''
let lastResultAt = 0
let pauseTimer: number | null = null

function clearPauseTimer() {
  if (pauseTimer) { window.clearTimeout(pauseTimer); pauseTimer = null }
}

function autoResize() {
  const el = inputRef.value; if (!el) return
  el.style.height = '0px'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function onInputResize() { autoResize() }

function attachHandlers() {
  if (!rec) return
  rec.onstart = () => { isListening.value = true; errMsg.value = null }
  rec.onend = () => { isListening.value = false; clearPauseTimer() }
  rec.onerror = (e: any) => { errMsg.value = e?.error || 'speech-error' }
  rec.onresult = (e: any) => {
    // concatena resultados
    let finalChunk = ''
    interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalChunk += (finalChunk ? ' ' : '') + r[0].transcript.trim()
      else interim += r[0].transcript
    }

    if (finalChunk) {
      // añade final al textarea
      const sep = text.value && !text.value.endsWith(' ') ? ' ' : ''
      text.value = (text.value + sep + finalChunk).replace(/\s+/g, ' ')
    }

    // muestra parcial en vivo (opcional: entre corchetes)
    // text.value = (text.value + ' ' + interim).trim()  // si quisieras mezclar parcial
    lastResultAt = Date.now()
    clearPauseTimer()

    // auto-puntuación si se queda en silencio un momento
    if (props.autoPunctuation) {
      pauseTimer = window.setTimeout(() => {
        if (Date.now() - lastResultAt > 1100 && !interim && text.value && !/[.!?…]\s*$/.test(text.value)) {
          text.value += '. '
          autoResize()
        }
      }, 1200)
    }

    nextTick(autoResize)
  }
}

async function startSTT() {
  if (!isSpeechSupported || disabled.value) return
  errMsg.value = null

  try { await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { /* algunos browsers */ }

  rec = new Rec()
  rec.lang = props.lang
  rec.interimResults = true
  rec.continuous = true
  attachHandlers()
  try { rec.start(); isListening.value = true } catch (e: any) { errMsg.value = e?.message || String(e) }
}

function stopSTT() {
  try { rec?.stop() } catch { }
  isListening.value = false
  clearPauseTimer()
}

async function toggleSTT() {
  if (!isSpeechSupported) {
    helpMsg.value = 'Este navegador no soporta Web Speech API. Usa Chrome/Edge y https (o localhost).'
    return
  }
  if (isListening.value) stopSTT()
  else await startSTT()
}

onMounted(() => nextTick(autoResize))
onBeforeUnmount(() => { stopSTT(); clearPauseTimer() })

/* ===== Envío ===== */
async function onSend() {
  const payload = text.value.trim()
  if (disabled.value || !payload) return
  emit('send', payload)
  text.value = ''
  nextTick(autoResize)
}
</script>

<style scoped>
.chatbar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1f1f1f;
  color: #e6e6e6;
  border-radius: 28px;
  padding: 8px 10px;
  border: 1px solid #2b2b2b;
  width: 100%;
  max-width: 720px;
}

.chatbar.disabled {
  opacity: .7;
  pointer-events: none;
}

.icon-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 18px;
  background: transparent;
  color: #cfcfcf;
  cursor: pointer;
}

.icon-btn:hover {
  background: #2a2a2a;
}

.icon-btn.rec {
  color: #ffd1d1;
  background: #3a1f1f;
}

.icon-btn.left {
  margin-left: 2px;
}

.send-btn {
  background: #2b6cb0;
  color: white;
}

.send-btn:hover {
  filter: brightness(1.05);
}

.input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  min-height: 36px;
}

.input-wrap textarea {
  width: 100%;
  background: transparent;
  color: #e6e6e6;
  border: none;
  outline: none;
  resize: none;
  line-height: 20px;
  padding: 8px 6px;
  font-size: 14px;
  max-height: 120px;
  /* coincide con autoResize */
}

.input-wrap textarea::placeholder {
  color: #8a8a8a;
}

.waves {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.waves span {
  width: 2px;
  height: 6px;
  background: currentColor;
  border-radius: 1px;
  animation: bounce .9s infinite ease-in-out;
}

.waves span:nth-child(2) {
  animation-delay: .1s;
}

.waves span:nth-child(3) {
  animation-delay: .2s;
}

.waves span:nth-child(4) {
  animation-delay: .3s;
}

.waves span:nth-child(5) {
  animation-delay: .4s;
}

@keyframes bounce {

  0%,
  100% {
    transform: scaleY(.5);
    opacity: .8
  }

  50% {
    transform: scaleY(1.6);
    opacity: 1
  }
}

.stt-help {
  margin-top: 6px;
  font-size: 12px;
  color: #b45309;
}
</style>
