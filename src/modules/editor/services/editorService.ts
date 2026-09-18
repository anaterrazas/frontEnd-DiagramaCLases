// src/modules/editor/services/editorService.ts
import client from "@/core/http/client";

/**
 * Helper compartido: hace POST a una URL, valida y descarga el blob como archivo.
 * Se usa para el codegen local, el generador externo y Flutter.
 */
async function downloadBlobFromPost(
  url: string,
  payload: unknown,
  fallbackFilename: string,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Error ${res.status}: ${text || res.statusText}`);
  }

  const disp = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^"]+)"?/.exec(disp);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

// ─── Generador externo (mantenido para compatibilidad; sin uso en la Fase 1) ───

export async function downloadZipGenerador(payload: unknown) {
  const base = import.meta.env.VITE_GENERATOR_API_BASE_URL;
  await downloadBlobFromPost(`${base}/api/codegen/flat`, payload, "codigo.zip");
}

// ─── Generador Flutter externo ───

export async function downloadFlutter(payload: unknown) {
  const base = import.meta.env.VITE_GENERATOR_FLUTTER_API_BASE_URL;
  await downloadBlobFromPost(`${base}/generate/flutter`, payload, "codigo.zip");
}

// ─── Generador local Spring Boot (Fase 1) ───

export async function downloadSpringBootProject(payload: unknown) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";
  await downloadBlobFromPost(`${base}/codegen/spring-boot`, payload, "codigo.zip");
}

// ─── IA / Imagen ───

/**
 * Sube una imagen (boceto) al backend para interpretarla con Gemini.
 * Devuelve el JSON de diagrama (el shape que tu engine necesita).
 */
export async function importarBocetoService(params: {
  file: File;
  prompt?: string;
}) {
  const form = new FormData();
  form.append("imagen", params.file); // <-- usa el MISMO nombre que espera el backend
  if (params.prompt?.trim()) form.append("prompt", params.prompt.trim());

  const { data } = await client.post("/ia/imagen", form);

  // El backend puede devolver: { success, message, data } o el objeto directo
  const rawPayload = data?.data ?? data;

  // Si viene como string con ```json ... ```, lo parseamos
  return typeof rawPayload === "string" ? extractJson(rawPayload) : rawPayload;
}

function extractJson(s: string) {
  const m = /```json\s*([\s\S]*?)```/i.exec(s);
  if (m?.[1]) return JSON.parse(m[1]);
  const i = s.indexOf("{"),
    j = s.lastIndexOf("}");
  if (i >= 0 && j > i) return JSON.parse(s.slice(i, j + 1));
  throw new Error("No se pudo extraer JSON válido del backend");
}

export async function sendPrompt(prompt: string, diagrama: object) {
  const { data } = await client.post("/ia/texto", {
    diagrama: diagrama,
    promptext: prompt,
  });
  console.log(data.data);
  return data.data;
}