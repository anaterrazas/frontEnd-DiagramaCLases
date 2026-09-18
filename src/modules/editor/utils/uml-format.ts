// Atributos: "id: Int"  <->  { name:"id", type:"Int" }
export function parseAttrLine(s: string) {
  const t = (s || '').trim()
  const i = t.lastIndexOf(':')
  if (i === -1) return { name: t, type: '' }
  return { name: t.slice(0, i).trim(), type: t.slice(i + 1).trim() }
}
export function stringifyAttr(r: { name: string; type: string }) {
  const n = (r.name || '').trim()
  const t = (r.type || '').trim()
  if (!n) return ''
  return t ? `${n}: ${t}` : n
}

// Métodos: "toString(): String"  <->  { name:"toString()", ret:"String" }
export function parseMethodLine(s: string) {
  const t = (s || '').trim()
  const i = t.lastIndexOf(':')
  if (i === -1) return { name: t, ret: '' }
  return { name: t.slice(0, i).trim(), ret: t.slice(i + 1).trim() }
}
export function stringifyMethod(r: { name: string; ret: string }) {
  let n = (r.name || '').trim()
  const ret = (r.ret || '').trim()
  if (!n) return ''
  if (!n.includes('(')) n = `${n}()`
  return ret ? `${n}: ${ret}` : n
}

// helper para buscar labels por posición
export function readLabelsByPosition(labels: any[], pos: number) {
  return labels.find(lb => Math.abs((lb.position ?? 0) - pos) < 0.05)
}
