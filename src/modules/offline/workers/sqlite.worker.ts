import type { Database } from '@sqlite.org/sqlite-wasm'
import type {
  OfflineRecord,
  OfflineWorkerExecutePayload,
  OfflineWorkerExecuteResult,
  OfflineWorkerInitializePayload,
  OfflineWorkerInitializeResult,
  OfflineWorkerRequest,
  OfflineWorkerResponse,
  OfflineWorkerResetPayload,
  OfflineWorkerResetResult,
  RealColumnInfo,
} from '../models/offline.models'
import { compareSchemas } from '../database/schemaGenerator'

type SqliteModule = {
  oo1: { OpfsDb: new (filename: string) => Database }
}
type SqliteModuleImport = {
  default: () => Promise<SqliteModule>
}

let sqlite: SqliteModule | null = null
let database: Database | null = null

function response(id: number, ok: boolean, result?: OfflineWorkerResponse['result'], error?: string): OfflineWorkerResponse {
  return { id, ok, result, error }
}

async function openDatabase(databaseName: string): Promise<Database> {
  if (database?.isOpen()) return database
  if (!sqlite) {
    const url = new URL(`${import.meta.env.BASE_URL}sqlite/sqlite3-bundler-friendly.mjs`, self.location.origin)
    const module = await import(/* @vite-ignore */ url.href) as unknown as SqliteModuleImport
    sqlite = await module.default()
  }
  if (!sqlite.oo1.OpfsDb) throw new Error('OPFS no está disponible en este navegador o el servidor no habilitó el aislamiento requerido.')
  database = new sqlite.oo1.OpfsDb(`/${databaseName}`)
  return database
}

function readFingerprint(db: Database): string | undefined {
  const rows = db.exec({
    sql: 'SELECT value FROM "__offline_metadata" WHERE key = ?',
    bind: ['schema_fingerprint'],
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as OfflineRecord[]
  const value = rows[0]?.value
  return typeof value === 'string' ? value : undefined
}

function getTableNames(db: Database): string[] {
  const rows = db.exec({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as OfflineRecord[]
  return rows.map((row) => String(row.name))
}

function getTableInfo(db: Database, tableName: string): RealColumnInfo[] {
  const rows = db.exec({
    sql: `PRAGMA table_info("${tableName}")`,
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as OfflineRecord[]
  return rows.map((row) => ({
    name: String(row.name),
    type: String(row.type),
    notnull: Number(row.notnull),
    pk: Number(row.pk),
    dflt_value: row.dflt_value,
  }))
}

function readRealSchema(db: Database): Record<string, RealColumnInfo[]> {
  const real: Record<string, RealColumnInfo[]> = {}
  for (const name of getTableNames(db)) {
    if (name === '__offline_metadata') continue
    real[name] = getTableInfo(db, name)
  }
  return real
}

function writeFingerprint(db: Database, fingerprint: string): void {
  db.exec({
    sql: 'UPDATE "__offline_metadata" SET value = ? WHERE key = ?',
    bind: [fingerprint, 'schema_fingerprint'],
  })
}

function migrationSummary(plan: { safe: string[] }): string {
  const statements = plan.safe
  const newTables = statements.filter((statement) => statement.startsWith('CREATE')).length
  const newColumns = statements.filter((statement) => statement.startsWith('ALTER')).length
  const parts: string[] = []
  if (newTables > 0) parts.push(`se agregó ${newTables} tabla(s)`)
  if (newColumns > 0) parts.push(`se agregó ${newColumns} columna(s)`)
  return parts.length > 0 ? `Esquema actualizado: ${parts.join(' y ')}.` : 'Esquema actualizado.'
}

/**
 * Removes the OPFS-backed database file, plus any SQLite sidecar files
 * (-journal, -wal, -shm), using the same native File System Access API that
 * sqlite-wasm's own OPFS proxy uses for its xDelete operation.
 */
async function removeOpfsDatabase(databaseName: string): Promise<boolean> {
  if (!navigator?.storage?.getDirectory) {
    throw new Error('OPFS no está disponible en este navegador o el servidor no habilitó el aislamiento requerido.')
  }
  const root = await navigator.storage.getDirectory()
  const baseName = databaseName.replace(/^\/+/, '').split('/').pop()
  if (!baseName) throw new Error('El nombre de la base offline es inválido.')
  let removed = false
  for (const entryName of [baseName, `${baseName}-journal`, `${baseName}-wal`, `${baseName}-shm`]) {
    try {
      await root.removeEntry(entryName, { recursive: true })
      removed = removed || entryName === baseName
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') continue
      throw error
    }
  }
  return removed
}

async function resetDatabase(databaseName: string): Promise<OfflineWorkerResetResult> {
  if (database?.isOpen()) {
    database.close()
    database = null
  }
  const removed = await removeOpfsDatabase(databaseName)
  return { removed, storage: 'opfs' }
}

async function initialize(payload: OfflineWorkerInitializePayload): Promise<OfflineWorkerInitializeResult> {
  const db = await openDatabase(payload.databaseName)
  db.exec('CREATE TABLE IF NOT EXISTS "__offline_metadata" (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  const persistedFingerprint = readFingerprint(db)
  if (persistedFingerprint && persistedFingerprint !== payload.schema.fingerprint) {
    const plan = compareSchemas(payload.schema, readRealSchema(db))
    if (plan.destructive.length > 0) {
      return {
        status: 'schema-change-required',
        persistedFingerprint,
        storage: 'opfs',
        migrationSummary: 'El esquema requiere una migración manual porque se detectó un cambio incompatible.',
        destructiveChanges: plan.destructive,
      }
    }
    if (plan.safe.length > 0) {
      db.exec('BEGIN')
      try {
        for (const statement of plan.safe) db.exec(statement)
        writeFingerprint(db, payload.schema.fingerprint)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return { status: 'ready', persistedFingerprint, storage: 'opfs', migrationSummary: migrationSummary(plan) }
    }
    writeFingerprint(db, payload.schema.fingerprint)
    return { status: 'ready', persistedFingerprint, storage: 'opfs', migrationSummary: 'Esquema actualizado.' }
  }
  if (!persistedFingerprint) {
    db.exec('BEGIN')
    try {
      for (const statement of payload.createStatements) db.exec(statement)
      db.exec({ sql: 'INSERT INTO "__offline_metadata" (key, value) VALUES (?, ?)', bind: ['schema_fingerprint', payload.schema.fingerprint] })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  return { status: 'ready', persistedFingerprint, storage: 'opfs' }
}

async function execute(payload: OfflineWorkerExecutePayload): Promise<OfflineWorkerExecuteResult> {
  if (!database?.isOpen()) throw new Error('La base offline no ha sido inicializada.')
  if (payload.returnsRows) {
    const rows = database.exec({ sql: payload.sql, bind: payload.params, rowMode: 'object', returnValue: 'resultRows' }) as OfflineRecord[]
    return { rows, changes: 0 }
  }
  database.exec({ sql: payload.sql, bind: payload.params })
  return { rows: [], changes: database.changes() }
}

self.addEventListener('message', (event: MessageEvent<OfflineWorkerRequest>) => {
  void (async () => {
    const { id, command, payload } = event.data
    try {
      if (command === 'initialize') {
        const result = await initialize(payload as OfflineWorkerInitializePayload)
        self.postMessage(response(id, true, result))
      } else if (command === 'execute') {
        const result = await execute(payload as OfflineWorkerExecutePayload)
        self.postMessage(response(id, true, result))
      } else if (command === 'reset') {
        const result = await resetDatabase((payload as OfflineWorkerResetPayload).databaseName)
        self.postMessage(response(id, true, result))
      } else if (command === 'close') {
        database?.close()
        database = null
        self.postMessage(response(id, true))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido en SQLite/WASM.'
      self.postMessage(response(id, false, undefined, message))
    }
  })()
})
