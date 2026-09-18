import type { ExportDiagramModelV2 } from '@/modules/editor/services/canvas.engine'

export type OfflineColumnType = 'INTEGER' | 'REAL' | 'TEXT'
export type OfflineValue = string | number | boolean | null
export type OfflineRecord = Record<string, OfflineValue>

export interface OfflineColumn {
  name: string
  type: OfflineColumnType
  isPrimaryKey: boolean
}

export interface OfflineTable {
  name: string
  columns: OfflineColumn[]
  primaryKey?: string
}

export interface OfflineSchema {
  version: 1
  fingerprint: string
  tables: OfflineTable[]
}

export interface OfflineSchemaBuildResult {
  schema: OfflineSchema
  createStatements: string[]
}

export interface OfflineValidationIssue {
  path: string
  message: string
}

export class OfflineValidationError extends Error {
  readonly issues: OfflineValidationIssue[]

  constructor(message: string, issues: OfflineValidationIssue[]) {
    super(message)
    this.name = 'OfflineValidationError'
    this.issues = issues
  }
}

export type OfflineInitializeStatus = 'ready' | 'schema-change-required'

export interface OfflineInitializeResult {
  status: OfflineInitializeStatus
  schema: OfflineSchema
  persistedFingerprint?: string
  storage: 'opfs'
  migrationSummary?: string
  destructiveChanges?: string[]
}

export interface OfflineMutationResult {
  changes: number
}

export interface OfflineWorkerInitializePayload {
  databaseName: string
  schema: OfflineSchema
  createStatements: string[]
}

export interface OfflineWorkerInitializeResult {
  status: OfflineInitializeStatus
  persistedFingerprint?: string
  storage: 'opfs'
  migrationSummary?: string
  destructiveChanges?: string[]
}

export interface RealColumnInfo {
  name: string
  type: string
  notnull: number
  pk: number
  dflt_value: unknown
}

export interface MigrationPlan {
  safe: string[]
  destructive: string[]
}

export interface OfflineWorkerExecutePayload {
  sql: string
  params: OfflineValue[]
  returnsRows: boolean
}

export interface OfflineWorkerExecuteResult {
  rows: OfflineRecord[]
  changes: number
}

export interface OfflineWorkerResetPayload {
  databaseName: string
}

export interface OfflineWorkerResetResult {
  removed: boolean
  storage: 'opfs'
}

export type OfflineWorkerCommand = 'initialize' | 'execute' | 'reset' | 'close'

export interface OfflineWorkerRequest {
  id: number
  command: OfflineWorkerCommand
  payload?: OfflineWorkerInitializePayload | OfflineWorkerExecutePayload | OfflineWorkerResetPayload
}

export interface OfflineWorkerResponse {
  id: number
  ok: boolean
  result?: OfflineWorkerInitializeResult | OfflineWorkerExecuteResult | OfflineWorkerResetResult
  error?: string
}

export type UmlDiagram = ExportDiagramModelV2
