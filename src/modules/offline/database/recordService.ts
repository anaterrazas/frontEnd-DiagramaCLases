import type { OfflineDatabase } from './database'
import type { OfflineColumn, OfflineMutationResult, OfflineRecord, OfflineSchema, OfflineTable, OfflineValue } from '../models/offline.models'
import { OfflineValidationError } from '../models/offline.models'

const quote = (identifier: string) => `"${identifier}"`

export class RecordService {
  private readonly database: OfflineDatabase
  private readonly schema: OfflineSchema

  constructor(database: OfflineDatabase, schema: OfflineSchema) {
    this.database = database
    this.schema = schema
  }

  async insert(tableName: string, data: OfflineRecord): Promise<OfflineMutationResult> {
    const table = this.table(tableName)
    const entries = this.entries(table, data, 'insertar')
    const columns = entries.map(([name]) => quote(name)).join(', ')
    const placeholders = entries.map(() => '?').join(', ')
    const result = await this.database.request('execute', {
      sql: `INSERT INTO ${quote(table.name)} (${columns}) VALUES (${placeholders})`,
      params: entries.map(([, value]) => value),
      returnsRows: false,
    })
    return { changes: result.changes }
  }

  async findAll(tableName: string): Promise<OfflineRecord[]> {
    const table = this.table(tableName)
    const result = await this.database.request('execute', { sql: `SELECT * FROM ${quote(table.name)}`, params: [], returnsRows: true })
    return result.rows
  }

  async findById(tableName: string, id: OfflineValue): Promise<OfflineRecord | null> {
    const table = this.table(tableName)
    const primaryKey = this.primaryKey(table)
    this.validateValue(primaryKey, id, `${table.name}.${primaryKey.name}`)
    const result = await this.database.request('execute', {
      sql: `SELECT * FROM ${quote(table.name)} WHERE ${quote(primaryKey.name)} = ? LIMIT 1`, params: [this.toSqlValue(primaryKey, id)], returnsRows: true,
    })
    return result.rows[0] ?? null
  }

  async update(tableName: string, id: OfflineValue, data: OfflineRecord): Promise<OfflineMutationResult> {
    const table = this.table(tableName)
    const primaryKey = this.primaryKey(table)
    this.validateValue(primaryKey, id, `${table.name}.${primaryKey.name}`)
    const entries = this.entries(table, data, 'actualizar').filter(([name]) => name !== primaryKey.name)
    if (entries.length === 0) throw this.invalid('No hay columnas actualizables.', [{ path: table.name, message: 'La clave primaria no puede actualizarse.' }])
    const assignments = entries.map(([name]) => `${quote(name)} = ?`).join(', ')
    const result = await this.database.request('execute', {
      sql: `UPDATE ${quote(table.name)} SET ${assignments} WHERE ${quote(primaryKey.name)} = ?`,
      params: [...entries.map(([, value]) => value), this.toSqlValue(primaryKey, id)], returnsRows: false,
    })
    return { changes: result.changes }
  }

  async remove(tableName: string, id: OfflineValue): Promise<OfflineMutationResult> {
    const table = this.table(tableName)
    const primaryKey = this.primaryKey(table)
    this.validateValue(primaryKey, id, `${table.name}.${primaryKey.name}`)
    const result = await this.database.request('execute', {
      sql: `DELETE FROM ${quote(table.name)} WHERE ${quote(primaryKey.name)} = ?`, params: [this.toSqlValue(primaryKey, id)], returnsRows: false,
    })
    return { changes: result.changes }
  }

  private table(name: string): OfflineTable {
    const table = this.schema.tables.find((candidate) => candidate.name === name)
    if (!table) throw this.invalid(`La tabla "${name}" no existe en el esquema UML actual.`, [{ path: name, message: 'Tabla no definida por UML.' }])
    return table
  }

  private primaryKey(table: OfflineTable): OfflineColumn {
    const key = table.columns.find((column) => column.isPrimaryKey)
    if (!key) throw this.invalid(`La tabla "${table.name}" no tiene una clave primaria UML compatible.`, [{ path: table.name, message: 'Se requiere id: Integer, Long o Short.' }])
    return key
  }

  private entries(table: OfflineTable, data: OfflineRecord, operation: string): [string, OfflineValue][] {
    if (!data || Array.isArray(data)) throw this.invalid(`Datos inválidos para ${operation}.`, [{ path: table.name, message: 'Se esperaba un objeto de registro.' }])
    const entries = Object.entries(data)
    if (entries.length === 0) throw this.invalid(`No hay datos para ${operation}.`, [{ path: table.name, message: 'El registro no puede estar vacío.' }])
    return entries.map(([name, value]) => {
      const column = table.columns.find((candidate) => candidate.name === name)
      if (!column) throw this.invalid(`La columna "${name}" no existe en "${table.name}".`, [{ path: `${table.name}.${name}`, message: 'Columna no definida por UML.' }])
      this.validateValue(column, value, `${table.name}.${name}`)
      return [name, this.toSqlValue(column, value)]
    })
  }

  private validateValue(column: OfflineColumn, value: OfflineValue, path: string): void {
    if (value === null) return
    const valid = (column.type === 'TEXT' && typeof value === 'string')
      || (column.type === 'REAL' && typeof value === 'number' && Number.isFinite(value))
      || (column.type === 'INTEGER' && ((typeof value === 'number' && Number.isInteger(value)) || (column.name.toLowerCase() !== 'id' && typeof value === 'boolean')))
    if (!valid) throw this.invalid(`Valor inválido para ${path}.`, [{ path, message: `Se esperaba ${column.type}.` }])
  }

  private toSqlValue(column: OfflineColumn, value: OfflineValue): OfflineValue {
    return column.type === 'INTEGER' && typeof value === 'boolean' ? Number(value) : value
  }

  private invalid(message: string, issues: { path: string; message: string }[]): OfflineValidationError {
    return new OfflineValidationError(message, issues)
  }
}
