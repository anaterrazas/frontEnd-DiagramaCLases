// Reconocimiento de voz en cliente usando Web Speech API
// Soporta resultados parciales (interim) y finales.
// Nota: En la mayoría de navegadores está detrás de webkitSpeechRecognition.

import { ref, computed, onBeforeUnmount } from 'vue'

type STTOptions = {
  lang?: string           // ej. 'es-BO', 'es-ES'
  interimResults?: boolean
  continuous?: boolean
  punctuation?: boolean   // "simulada": agrega puntos cuando hay pausas largas (sencillo)
}

export function useSpeechToText(opts: STTOptions = {}) {
  const SpeechRec: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const isSupported = !!SpeechRec

  const lang = opts.lang ?? 'es-BO'
  const interimResults = opts.interimResults ?? true
  const continuous = opts.continuous ?? true
  const punctuation = opts.punctuation ?? false

  const isListening = ref(false)
  const interim = ref('')        // texto parcial (en vivo)
  const finalText = ref('')      // acumulado final
  const errorMsg = ref<string | null>(null)

  let rec: any = null
  let lastResultAt = 0
  let pauseTimer: number | null = null

  function clearPauseTimer() {
    if (pauseTimer) { window.clearTimeout(pauseTimer); pauseTimer = null }
  }

  function addPunctuationIfNeeded() {
    if (!punctuation || !finalText.value.trim()) return
    const t = finalText.value.trim()
    if (!/[.!?…]$/.test(t)) finalText.value = t + '. '
  }

  function start() {
    if (!isSupported || isListening.value) return
    errorMsg.value = null
    interim.value = ''

    rec = new SpeechRec()
    rec.lang = lang
    rec.interimResults = interimResults
    rec.continuous = continuous

    rec.onstart = () => { isListening.value = true }
    rec.onend = () => { 
      isListening.value = false
      clearPauseTimer()
      // para UX: si se detiene por error de red/permiso, puedes reintentar aquí si quieres
    }

    rec.onerror = (ev: any) => {
      errorMsg.value = ev?.error || 'speech-error'
    }

    rec.onresult = (ev: any) => {
      let partial = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]
        if (res.isFinal) {
          finalText.value += (finalText.value ? ' ' : '') + res[0].transcript.trim()
          interim.value = ''
          if (punctuation) addPunctuationIfNeeded()
        } else {
          partial += res[0].transcript
        }
      }
      interim.value = partial

      // Heurística de pausa: si pasan ~1.2s sin nuevos resultados, agrega puntuación
      lastResultAt = Date.now()
      clearPauseTimer()
      if (punctuation) {
        pauseTimer = window.setTimeout(() => {
          if (Date.now() - lastResultAt > 1100 && interim.value.length === 0) {
            addPunctuationIfNeeded()
          }
        }, 1200)
      }
    }

    try {
      rec.start()
    } catch (e) {
      // Algunos navegadores lanzan si ya está iniciado
    }
  }

  function stop() {
    if (!isSupported || !isListening.value) return
    try { rec.stop() } catch {}
  }

  function toggle() {
    if (isListening.value) stop()
    else start()
  }

  function reset() {
    interim.value = ''
    finalText.value = ''
    errorMsg.value = null
  }

  onBeforeUnmount(() => {
    clearPauseTimer()
    if (isListening.value) stop()
  })

  return {
    state: {
      isSupported,
      isListening,
      interim,
      finalText,
      errorMsg,
      lang: computed(() => lang)
    },
    start, stop, toggle, reset
  }
}
