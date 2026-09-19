// src/core/uml/xmi/xmi.escape.ts

export function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function xmlAttribute(name: string, value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return ''
  }

  return ` ${name}="${escapeXmlAttribute(String(value))}"`
}
