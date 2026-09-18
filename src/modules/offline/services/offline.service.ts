import { OfflineDatabase } from '../database/database'
import { RecordService } from '../database/recordService'
import { generateOfflineSchema } from '../database/schemaGenerator'
import type {
  OfflineInitializeResult,
  OfflineMutationResult,
  OfflineRecord,
  OfflineSchema,
  OfflineValue,
  UmlDiagram,
} from '../models/offline.models'

const DATABASE_NAME = 'uml-offline.sqlite3'

class OfflineService {
  private database: OfflineDatabase | null = null
  private records: RecordService | null = null
  private schema: OfflineSchema | null = null

  async initializeFromUml(uml: UmlDiagram): Promise<OfflineInitializeResult> {
    const definition = generateOfflineSchema(uml)
    if (this.database && this.schema?.fingerprint !== definition.schema.fingerprint) await this.close()
    this.database ??= new OfflineDatabase()
    const result = await this.database.request('initialize', { databaseName: DATABASE_NAME, ...definition })
    this.schema = definition.schema
    this.records = result.status === 'ready' ? new RecordService(this.database, definition.schema) : null
    return {
      status: result.status,
      schema: definition.schema,
      persistedFingerprint: result.persistedFingerprint,
      storage: result.storage,
      migrationSummary: result.migrationSummary,
      destructiveChanges: result.destructiveChanges,
    }
  }

  /**
   * Deletes the persisted OPFS database and re-initializes it from the given
   * UML, recreating all tables, __offline_metadata and the schema fingerprint
   * from scratch. Returns a ready initialize result.
   */
  async resetFromUml(uml: UmlDiagram): Promise<OfflineInitializeResult> {
    const target = this.database ?? new OfflineDatabase()
    try {
      await target.request('reset', { databaseName: DATABASE_NAME })
    } finally {
      await target.close()
    }
    this.database = null
    this.records = null
    this.schema = null
    return this.initializeFromUml(uml)
  }

  insert(table: string, data: OfflineRecord): Promise<OfflineMutationResult> { return this.service().insert(table, data) }
  findAll(table: string): Promise<OfflineRecord[]> { return this.service().findAll(table) }
  findById(table: string, id: OfflineValue): Promise<OfflineRecord | null> { return this.service().findById(table, id) }
  update(table: string, id: OfflineValue, data: OfflineRecord): Promise<OfflineMutationResult> { return this.service().update(table, id, data) }
  remove(table: string, id: OfflineValue): Promise<OfflineMutationResult> { return this.service().remove(table, id) }

  async close(): Promise<void> {
    const database = this.database
    this.database = null
    this.records = null
    this.schema = null
    if (database) await database.close()
  }

  private service(): RecordService {
    if (!this.records) throw new Error('La base offline no está lista. Inicialízala desde un UML compatible primero.')
    return this.records
  }
}

export const offlineService = new OfflineService()
