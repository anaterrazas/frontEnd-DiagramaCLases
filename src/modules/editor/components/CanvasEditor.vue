<template>
  <div ref="wrap" class="canvas-wrap">
    <canvas ref="canvas" class="canvas" />
  </div>
  <!-- 🔽 Barra de chat a todo el ancho, justo debajo del canvas -->
  <div class="chatbar-wrap">
    <ChatPrompt
      :disabled="sending"
      placeholder="Describe tu diagrama o pide algo…"
      lang="es-ES"
      @send="onPrompt"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import { useEditorStore } from "@/modules/editor/store/editor.store";
import { CanvasEngine } from "@/modules/editor/services/canvas.engine";
import { useSalaSocket } from "@/modules/editor/hooks/useSalaSocket";
import ChatPrompt from "@/modules/editor/components/ChatPrompt.vue";
const sending = ref(false);
const route = useRoute();
const salaId = String(route.params.salaId ?? "demo");

const wrap = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const store = useEditorStore();

async function onPrompt(text: string) {
  sending.value = true;
  try {
    store.sendPrompt(text);
  } catch (e) {
    console.error(e);
  } finally {
    sending.value = false;
  }
}

let engine: CanvasEngine | null = null;
let onResize: (() => void) | null = null;

let draggingId: string | null = null;
let offX = 0,
  offY = 0;
let panning = false;
let lastSX = 0,
  lastSY = 0;
let spaceDown = false;

// NUEVO: arrastre de extremos
let draggingEnd: null | { linkId: string; which: "src" | "tgt" } = null;

const { isLocked } = useSalaSocket(salaId, () => engine);

/* ===== helpers para ancla desde punto ===== */
type Side = "L" | "R" | "T" | "B";
type Anchor = { side: Side; t: number };
function pointToAnchor(
  node: { x: number; y: number; w: number; h: number },
  wx: number,
  wy: number,
): Anchor {
  const dL = Math.abs(wx - node.x);
  const dR = Math.abs(wx - (node.x + node.w));
  const dT = Math.abs(wy - node.y);
  const dB = Math.abs(wy - (node.y + node.h));
  let side: Side;
  if (dL <= dR && dL <= dT && dL <= dB) side = "L";
  else if (dR <= dT && dR <= dB) side = "R";
  else if (dT <= dB) side = "T";
  else side = "B";
  let t = 0;
  if (side === "L" || side === "R") t = (wy - node.y) / node.h;
  else t = (wx - node.x) / node.w;
  // clamp
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return { side, t };
}

function fit() {
  if (!canvas.value || !wrap.value) return;
  const dpr = window.devicePixelRatio || 1;
  const { clientWidth, clientHeight } = wrap.value;
  canvas.value.width = Math.floor(clientWidth * dpr);
  canvas.value.height = Math.floor(clientHeight * dpr);
  canvas.value.style.width = clientWidth + "px";
  canvas.value.style.height = clientHeight + "px";
  const ctx = canvas.value.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  engine?.requestDraw();
}

onMounted(() => {
  if (!canvas.value) return;
  engine = new CanvasEngine(canvas.value);
  store.setEngine(engine);
  fit();
  onResize = () => fit();
  window.addEventListener("resize", onResize);

  const getScreen = (ev: PointerEvent | WheelEvent) => {
    const rect = canvas.value!.getBoundingClientRect();
    return { sx: ev.clientX - rect.left, sy: ev.clientY - rect.top };
  };
  const getWorld = (ev: PointerEvent | WheelEvent) => {
    const { sx, sy } = getScreen(ev);
    const { x, y } = engine!.screenToWorld(sx, sy);
    return { wx: x, wy: y, sx, sy };
  };

  canvas.value.addEventListener("pointerdown", (ev) => {
    if (!engine) return;
    ev.preventDefault();
    try {
      canvas.value!.setPointerCapture(ev.pointerId);
    } catch {}

    const { wx, wy, sx, sy } = getWorld(ev);

    if (ev.button === 1 || (spaceDown && ev.button === 0)) {
      panning = true;
      lastSX = sx;
      lastSY = sy;
      draggingId = null;
      draggingEnd = null;
      return;
    }

    // 🔹 Primero: ¿estás pinchando un extremo de algún link?
    const handle = (engine as any).getEndpointHandleAt?.(wx, wy) as null | {
      linkId: string;
      which: "src" | "tgt";
    };
    if (handle) {
      if (isLocked("link", handle.linkId)) return;
      store.setSelected("link", handle.linkId);
      draggingEnd = handle;
      draggingId = null;
      return;
    }

    const hit = engine.hitTest(wx, wy);

    if (store.tool === "add-class") {
      engine.addClass(wx, wy, "Tabla");
      store.resetTool();
      return;
    }

    if (store.tool === "add-link") {
      if (hit.type === "class") {
        if (isLocked("class", hit.id)) return;

        if (!store.firstForLink) {
          store.setFirstForLink(hit.id);
          store.setSelected("class", hit.id);
        } else {
          const srcId = store.firstForLink;
          const tgtId = hit.id;
          const isSelf = srcId === tgtId;

          // ✅ sólo permitir self-link cuando la relación es 'Associate'
          const canSelf = !isSelf || store.relationKind === "Associate";
          if (!canSelf) {
            store.resetTool();
            return;
          }

          engine.addLink(store.relationKind, srcId, tgtId);
          store.resetTool();
        }
      }
      return;
    }

    if (store.tool === "add-assoc-class") {
      if (hit.type === "class") {
        if (isLocked("class", hit.id)) return;

        if (!store.firstForLink) {
          store.setFirstForLink(hit.id);
          store.setSelected("class", hit.id);
        } else {
          const srcId = store.firstForLink;
          const tgtId = hit.id;
          engine.addAssociationClassBetween(srcId, tgtId, "Asociación");
          store.resetTool();
        }
      }
      return;
    }

    if (hit.type === "class") {
      if (isLocked("class", hit.id)) return;
      store.setSelected("class", hit.id);
      const n = engine.model.classes[hit.id];
      draggingId = hit.id;
      offX = wx - n.x;
      offY = wy - n.y;
      draggingEnd = null;
    } else if (hit.type === "link") {
      if (isLocked("link", hit.id)) return;
      store.setSelected("link", hit.id);
      draggingId = null;
      draggingEnd = null;
    } else {
      store.setSelected(null, null);
      draggingId = null;
      draggingEnd = null;
    }
  });

  canvas.value.addEventListener("pointermove", (ev) => {
    if (!engine) return;
    if (panning) {
      const { sx, sy } = getWorld(ev);
      engine.panBy(sx - lastSX, sy - lastSY);
      lastSX = sx;
      lastSY = sy;
      return;
    }
    if (draggingId) {
      if (isLocked("class", draggingId)) return;
      const { wx, wy } = getWorld(ev);
      engine.setClassPosition(draggingId, wx - offX, wy - offY);
      return;
    }
    // (Opcional) podrías previsualizar un ancla mientras arrastras el extremo:
    // para mantener tráfico de red bajo, lo dejamos para pointerup.
  });

  const endPointer = (ev?: PointerEvent) => {
    if (!engine) return;

    // 🔸 Resolver arrastre de extremo (anclas/retarget)
    if (draggingEnd && ev) {
      const rect = canvas.value!.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const { x: wx, y: wy } = engine.screenToWorld(sx, sy);

      const { linkId, which } = draggingEnd;
      const link = engine.model.links[linkId];
      if (link) {
        const hit = engine.hitTest(wx, wy);
        const nodeId = which === "src" ? link.sourceId : link.targetId;

        if (hit.type === "class") {
          if (hit.id === nodeId) {
            // ✅ misma clase → reposicionar puntero alrededor del borde
            const node = engine.model.classes[nodeId];
            const anchor = pointToAnchor(node, wx, wy);
            if (which === "src")
              engine.updateLink(linkId, { anchorSrc: anchor } as any);
            else engine.updateLink(linkId, { anchorTgt: anchor } as any);
          } else {
            // 🔁 otra clase → reconectar extremo y limpiar ancla de ese lado
            if (which === "src")
              engine.updateLink(linkId, {
                sourceId: hit.id,
                anchorSrc: null,
              } as any);
            else
              engine.updateLink(linkId, {
                targetId: hit.id,
                anchorTgt: null,
              } as any);
          }
        } else {
          // si soltaste fuera, no hacemos nada especial
        }
      }
    }

    // 🔸 Fin de arrastre de clase normal
    if (engine && draggingId && ev) {
      const rect = canvas.value!.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const { x, y } = engine.screenToWorld(sx, sy);
      if (!isLocked("class", draggingId)) {
        engine.setClassPosition(draggingId, x - offX, y - offY);
      }
    }

    draggingEnd = null;
    draggingId = null;
    panning = false;
    if (!canvas.value || !ev) return;
    try {
      canvas.value.releasePointerCapture(ev.pointerId);
    } catch {}
  };

  canvas.value.addEventListener("pointerup", endPointer);
  canvas.value.addEventListener("pointerleave", endPointer);

  canvas.value.addEventListener(
    "wheel",
    (ev) => {
      if (!engine) return;
      ev.preventDefault();
      const { sx, sy } = getWorld(ev);
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      engine.zoomAtScreenPoint(sx, sy, factor);
    },
    { passive: false },
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space") spaceDown = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") spaceDown = false;
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onResize!);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  });
});
</script>

<style scoped>
.canvas-pane {
  display: grid;
  grid-template-rows: auto auto;
  gap: 10px;
}

.canvas-wrap {
  width: 100%;
  height: 70vh;
  border: 1px solid #ddd;
  background: #5e0a0a;
  border-radius: 6px;
}

.canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.chatbar-wrap {
  display: flex;
  justify-content: center;
}

:deep(.chatbar) {
  width: 100%;
  max-width: none;
}
</style>
