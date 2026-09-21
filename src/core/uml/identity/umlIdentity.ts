/** Namespaces of the three IDs owned by a UML element. */
export type UmlIdentityIdKind = 'semantic' | 'visual' | 'external'

/** Origin of an identifier supplied by another tool or file format. */
export type UmlExternalIdSource = 'enterprise-architect' | 'xmi' | 'other'

export interface UmlExternalId {
  readonly source: UmlExternalIdSource
  readonly value: string
}

/**
 * Stable identity shared by the semantic UML model and its projections.
 *
 * `externalIds` is empty for a newly-created element. Imported identifiers are
 * stored unchanged together with the system that supplied them.
 */
export interface UmlIdentity {
  readonly semanticId: string
  readonly visualId: string
  readonly externalIds: readonly UmlExternalId[]
}

/** Alias using the acronym casing used by the rest of the UML module. */
export type UMLIdentity = UmlIdentity

export interface CreateUmlIdentityOptions {
  semanticId?: string
  visualId?: string
  externalIds?: readonly UmlExternalId[]
}

let generatedIdSequence = 0

/** Creates one opaque ID. It is called only when an identity is created. */
function generateId(namespace: UmlIdentityIdKind): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${namespace}-${uuid}`

  generatedIdSequence += 1
  return `${namespace}-${Date.now().toString(36)}-${generatedIdSequence.toString(36)}`
}

function requireId(value: string | undefined, namespace: UmlIdentityIdKind): string {
  if (value === undefined) return generateId(namespace)
  if (value.trim() === '') throw new Error(`${namespace}Id no puede estar vacio.`)
  return value
}

/**
 * Creates an identity once. Calling this function is the identity boundary;
 * serialization and projections must pass the resulting values through.
 */
export function createUmlIdentity(options: CreateUmlIdentityOptions = {}): UmlIdentity {
  const externalIds = options.externalIds?.map((externalId) => {
    if (externalId.value.trim() === '') {
      throw new Error('El valor de un identificador externo no puede estar vacio.')
    }

    return Object.freeze({ ...externalId })
  }) ?? []

  const identity: UmlIdentity = {
    semanticId: requireId(options.semanticId, 'semantic'),
    visualId: requireId(options.visualId, 'visual'),
    externalIds: Object.freeze(externalIds),
  }

  return Object.freeze(identity)
}
