import {
  createUmlIdentity,
  type CreateUmlIdentityOptions,
  type UmlIdentity,
  type UmlIdentityIdKind,
  type UmlExternalId,
} from './umlIdentity'
import type { UMLProjectDocument } from '../uml.project'

export class UmlIdentityCollisionError extends Error {
  readonly kind: UmlIdentityIdKind
  readonly id: string

  constructor(kind: UmlIdentityIdKind, id: string) {
    super(`Colision de ${kind}Id: "${id}".`)
    this.name = 'UmlIdentityCollisionError'
    this.kind = kind
    this.id = id
  }
}

type IdentityByKind = ReadonlyMap<string, UmlIdentity>

/**
 * Registry for the lifetime of a UML document/session.
 * IDs are reserved by namespace and are never rewritten by this registry.
 */
export class UmlIdRegistry {
  private readonly bySemanticId = new Map<string, UmlIdentity>()
  private readonly byVisualId = new Map<string, UmlIdentity>()
  private readonly byExternalId = new Map<string, UmlIdentity>()

  create(options: CreateUmlIdentityOptions = {}): UmlIdentity {
    return this.register(createUmlIdentity(options))
  }

  /** Registers imported identities without replacing any of their IDs. */
  register(identity: UmlIdentity): UmlIdentity {
    this.assertAvailable('semantic', identity.semanticId, this.bySemanticId)
    this.assertAvailable('visual', identity.visualId, this.byVisualId)
    this.assertExternalIdsAvailable(identity.externalIds)

    this.bySemanticId.set(identity.semanticId, identity)
    this.byVisualId.set(identity.visualId, identity)
    this.reserveExternalIds(identity.externalIds, identity)
    return identity
  }

  /** Reserves a visual projection of an already-registered semantic element. */
  registerVisualIdentity(identity: UmlIdentity): UmlIdentity {
    const existingVisual = this.byVisualId.get(identity.visualId)
    if (existingVisual !== undefined) {
      if (existingVisual.semanticId === identity.semanticId && sameIdentityIds(existingVisual, identity)) {
        return existingVisual
      }
      throw new UmlIdentityCollisionError('visual', identity.visualId)
    }

    this.assertExternalIdsAvailable(identity.externalIds, identity.semanticId)
    this.byVisualId.set(identity.visualId, identity)
    this.reserveExternalIds(identity.externalIds, identity)
    return identity
  }

  getBySemanticId(id: string): UmlIdentity | undefined {
    return this.bySemanticId.get(id)
  }

  getByVisualId(id: string): UmlIdentity | undefined {
    return this.byVisualId.get(id)
  }

  getByExternalId(source: UmlExternalId['source'], value: string): UmlIdentity | undefined {
    return this.byExternalId.get(externalKey(source, value))
  }

  has(kind: UmlIdentityIdKind, id: string): boolean {
    return this.mapFor(kind).has(id)
  }

  /** Fails if any ID in the supplied identity is already reserved. */
  validate(identity: UmlIdentity): void {
    this.assertAvailable('semantic', identity.semanticId, this.bySemanticId)
    this.assertAvailable('visual', identity.visualId, this.byVisualId)
    this.assertExternalIdsAvailable(identity.externalIds)
  }

  values(): UmlIdentity[] {
    return [...this.bySemanticId.values()]
  }

  private assertAvailable(kind: UmlIdentityIdKind, id: string, map: IdentityByKind): void {
    if (map.has(id)) throw new UmlIdentityCollisionError(kind, id)
  }

  private mapFor(kind: UmlIdentityIdKind): IdentityByKind {
    if (kind === 'semantic') return this.bySemanticId
    if (kind === 'visual') return this.byVisualId
    return this.byExternalId
  }

  private assertExternalIdsAvailable(externalIds: readonly UmlExternalId[], semanticId?: string): void {
    const requested = new Set<string>()
    for (const externalId of externalIds) {
      const key = externalKey(externalId.source, externalId.value)
      if (requested.has(key)) {
        throw new UmlIdentityCollisionError('external', `${externalId.source}:${externalId.value}`)
      }
      requested.add(key)

      const existing = this.byExternalId.get(key)
      if (existing !== undefined && existing.semanticId !== semanticId) {
        throw new UmlIdentityCollisionError('external', `${externalId.source}:${externalId.value}`)
      }
    }
  }

  private reserveExternalIds(externalIds: readonly UmlExternalId[], identity: UmlIdentity): void {
    for (const externalId of externalIds) {
      this.byExternalId.set(externalKey(externalId.source, externalId.value), identity)
    }
  }
}

function externalKey(source: UmlExternalId['source'], value: string): string {
  return `${source}\u0000${value}`
}

function sameIdentityIds(left: UmlIdentity, right: UmlIdentity): boolean {
  if (left.semanticId !== right.semanticId || left.visualId !== right.visualId) return false
  if (left.externalIds.length !== right.externalIds.length) return false

  return left.externalIds.every((externalId, index) => {
    const other = right.externalIds[index]
    return externalId.source === other.source && externalId.value === other.value
  })
}

/**
 * Hydrates a registry from a project document without mutating that document.
 * Legacy elements use their existing `id` as semantic identity and a
 * deterministic visual fallback until a real visual identity is assigned.
 */
export function hydrateUmlIdRegistry(document: UMLProjectDocument): UmlIdRegistry {
  const registry = new UmlIdRegistry()
  const registerSemantic = (element: { id: string; identity?: UmlIdentity }): void => {
    registry.register(element.identity ?? createUmlIdentity({
      semanticId: element.id,
      visualId: `visual-${element.id}`,
    }))
  }

  registerSemantic(document.model)
  for (const classifier of document.model.classifiers) {
    registerSemantic(classifier)
    if (classifier.kind === 'enumeration') {
      for (const literal of classifier.literals) registerSemantic(literal)
    } else {
      for (const attribute of classifier.attributes ?? []) registerSemantic(attribute)
      for (const operation of classifier.operations) {
        registerSemantic(operation)
        for (const parameter of operation.parameters) registerSemantic(parameter)
      }
    }
  }

  for (const association of document.model.associations) {
    registerSemantic(association)
    for (const end of association.ends) registerSemantic(end)
  }
  for (const generalization of document.model.generalizations) registerSemantic(generalization)
  for (const dependency of document.model.dependencies) registerSemantic(dependency)
  for (const realization of document.model.realizations) registerSemantic(realization)
  for (const associationClass of document.model.associationClasses) registerSemantic(associationClass)

  for (const diagram of document.diagrams) {
    for (const element of diagram.elements) {
      const identity = element.identity ?? createUmlIdentity({
        semanticId: element.semanticElementId,
        visualId: element.id,
      })
      registry.registerVisualIdentity(identity)
    }
  }

  return registry
}
