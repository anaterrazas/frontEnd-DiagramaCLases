import type { UMLAttr, UMLMethod, UMLVisibility } from '@/modules/editor/types/uml-classic'

function stripAccidentalVis(s: string) {
  // elimina un símbolo de visibilidad que haya quedado pegado al nombre
  return s.replace(/^[+\-#~]\s*/, '')
}

export function parseAttrLineWithVis(line: string): UMLAttr {
  const t = (line ?? '').trim()
  if (!t) return { vis: '+', name: '', type: 'string' }

  let vis: UMLVisibility = '+'
  let s = t

  // acepta símbolo con o sin espacio: "+ nombre" o "+nombre"
  const ch = s[0]
  if (ch && '+-#~'.includes(ch)) { vis = ch as UMLVisibility; s = s.slice(1).trim() }

  const i = s.lastIndexOf(':')
  const rawName = i === -1 ? s : s.slice(0, i).trim()
  const type = i === -1 ? 'string' : (s.slice(i + 1).trim() || 'string')
  const name = stripAccidentalVis(rawName)

  return { vis, name, type }
}

export function parseMethodLineWithVis(line: string): UMLMethod {
  const t = (line ?? '').trim()
  if (!t) return { vis: '+', name: '', returnType: '' }

  let vis: UMLVisibility = '+'
  let s = t

  const ch = s[0]
  if (ch && '+-#~'.includes(ch)) { vis = ch as UMLVisibility; s = s.slice(1).trim() }

  const i = s.lastIndexOf(':')
  const rawName = i === -1 ? s : s.slice(0, i).trim()
  const returnType = i === -1 ? '' : (s.slice(i + 1).trim() || '')
  const name = stripAccidentalVis(rawName)

  return { vis, name, returnType }
}
