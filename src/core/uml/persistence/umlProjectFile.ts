// src/core/uml/persistence/umlProjectFile.ts
// Persistencia local simple de UMLProjectDocument como archivo JSON.

import type { UMLProjectDocument } from '../uml.project'
import type { LoadUmlProjectDocumentResult } from '../uml.project.serialization'
import {
  loadUmlProjectDocumentFromJson,
  serializeUmlProjectDocument,
} from '../uml.project.serialization'

export const UML_PROJECT_FILE_EXTENSION = '.umlproject'

export const UML_PROJECT_FILE_MIME = 'application/json'

export function normalizeUmlProjectFilename(name: string): string {
  const trimmedName = name.trim()
  const baseName = trimmedName.length > 0 ? trimmedName : 'uml-project'

  return baseName.endsWith(UML_PROJECT_FILE_EXTENSION)
    ? baseName
    : `${baseName}${UML_PROJECT_FILE_EXTENSION}`
}

export function createUmlProjectFileBlob(document: UMLProjectDocument): Blob {
  return new Blob([serializeUmlProjectDocument(document)], {
    type: UML_PROJECT_FILE_MIME,
  })
}

export function downloadUmlProjectDocument(
  umlDocument: UMLProjectDocument,
  filename?: string,
): void {
  const blob = createUmlProjectFileBlob(umlDocument)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = normalizeUmlProjectFilename(filename ?? umlDocument.name)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function loadUmlProjectDocumentFromText(text: string): LoadUmlProjectDocumentResult {
  return loadUmlProjectDocumentFromJson(text)
}

export async function readUmlProjectDocumentFile(file: File): Promise<LoadUmlProjectDocumentResult> {
  return loadUmlProjectDocumentFromText(await file.text())
}
