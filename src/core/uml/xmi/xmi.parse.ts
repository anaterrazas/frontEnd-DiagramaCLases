// src/core/uml/xmi/xmi.parse.ts
// Parser XML minimo para XMI generado por el exportador del proyecto.

export interface XmiNode {
  name: string
  attributes: Record<string, string>
  children: XmiNode[]
}

export interface XmiParseResult {
  root?: XmiNode
  errors: string[]
}

export function parseXml(xml: string): XmiParseResult {
  const errors: string[] = []
  const stack: XmiNode[] = []
  let root: XmiNode | undefined
  const tags = xml.match(/<[^>]+>/g) ?? []

  for (const tag of tags) {
    if (tag.startsWith('<?') || tag.startsWith('<!--')) {
      continue
    }

    if (tag.startsWith('</')) {
      const tagName = tag.slice(2, -1).trim()
      const current = stack.pop()

      if (current === undefined) {
        errors.push(`Cierre XML inesperado: ${tagName}.`)
        continue
      }

      if (current.name !== tagName) {
        errors.push(`Cierre XML invalido. Esperado ${current.name}, recibido ${tagName}.`)
      }
      continue
    }

    const selfClosing = tag.endsWith('/>')
    const content = tag.slice(1, selfClosing ? -2 : -1).trim()
    const nameMatch = content.match(/^([^\s]+)/)

    if (nameMatch === null) {
      errors.push(`Etiqueta XML invalida: ${tag}.`)
      continue
    }

    const node: XmiNode = {
      name: nameMatch[1],
      attributes: parseAttributes(content.slice(nameMatch[1].length)),
      children: [],
    }

    const parent = stack[stack.length - 1]
    if (parent !== undefined) {
      parent.children.push(node)
    } else if (root === undefined) {
      root = node
    } else {
      errors.push(`XML contiene mas de un elemento raiz: ${node.name}.`)
    }

    if (!selfClosing) {
      stack.push(node)
    }
  }

  if (stack.length > 0) {
    errors.push(`XML incompleto. Falta cerrar: ${stack.map((node) => node.name).join(', ')}.`)
  }

  if (root === undefined) {
    errors.push('No se encontro elemento raiz XML.')
  }

  return { root, errors }
}

export function attr(node: XmiNode, name: string): string | undefined {
  return node.attributes[name]
}

export function childElements(node: XmiNode, name?: string): XmiNode[] {
  if (name === undefined) {
    return node.children
  }

  return node.children.filter((child) => child.name === name)
}

export function findFirstDescendant(node: XmiNode, predicate: (child: XmiNode) => boolean): XmiNode | undefined {
  for (const child of node.children) {
    if (predicate(child)) {
      return child
    }

    const nested = findFirstDescendant(child, predicate)
    if (nested !== undefined) {
      return nested
    }
  }

  return undefined
}

function parseAttributes(input: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const attributePattern = /([^\s=]+)="([^"]*)"/g
  let match = attributePattern.exec(input)

  while (match !== null) {
    attributes[match[1]] = unescapeXmlAttribute(match[2])
    match = attributePattern.exec(input)
  }

  return attributes
}

function unescapeXmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
