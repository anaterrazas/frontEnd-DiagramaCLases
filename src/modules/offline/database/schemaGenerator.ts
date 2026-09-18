import type {
  MigrationPlan,
  OfflineColumn,
  OfflineColumnType,
  OfflineSchema,
  OfflineSchemaBuildResult,
  OfflineTable,
  RealColumnInfo,
  UmlDiagram,
} from '../models/offline.models'
import { OfflineValidationError } from '../models/offline.models'

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const typeMap: Record<string, OfflineColumnType> = {
  string: 'TEXT',
  text: 'TEXT',
  int: 'INTEGER',
  integer: 'INTEGER',
  long: 'INTEGER',
  short: 'INTEGER',
  number: 'INTEGER',
  bigint: 'INTEGER',
  float: 'REAL',
  double: 'REAL',
  decimal: 'REAL',
  boolean: 'INTEGER',
  bool: 'INTEGER',
  date: 'TEXT',
  datetime: 'TEXT',
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`
}

function normalizeType(type: string): OfflineColumnType {
  return typeMap[type.trim().toLowerCase().replace(/\s/g, '')] ?? 'TEXT'
}

function fingerprint(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`
}

function createTableStatement(table: OfflineTable): string {
  const columns = table.columns.map((column) => {
    const primaryKey = column.isPrimaryKey ? ' PRIMARY KEY' : ''
    return `${quoteIdentifier(column.name)} ${column.type}${primaryKey}`
  })
  return `CREATE TABLE ${quoteIdentifier(table.name)} (${columns.join(', ')})`
}

/** Converts only the typed v2 export into a safe, deterministic SQLite schema. */
export function generateOfflineSchema(uml: UmlDiagram): OfflineSchemaBuildResult {
  const issues: { path: string; message: string }[] = []
  const tables: OfflineTable[] = []
  const usedTables = new Set<string>()
  const classes: Record<string, UmlDiagram['classes'][string]> = uml.classes

  for (const [classId, umlClass] of Object.entries(classes)) {
    const tableName = umlClass.name.trim()
    const tableKey = tableName.toLowerCase()
    if (!IDENTIFIER.test(tableName)) {
      issues.push({ path: `classes.${classId}.name`, message: 'El nombre de tabla debe ser un identificador SQL seguro.' })
      continue
    }
    if (usedTables.has(tableKey)) {
      issues.push({ path: `classes.${classId}.name`, message: `La tabla "${tableName}" está duplicada.` })
      continue
    }
    usedTables.add(tableKey)

    const columns: OfflineColumn[] = []
    const usedColumns = new Set<string>()
    for (const [attributeIndex, attribute] of umlClass.attributes.entries()) {
      const columnName = attribute.name.trim()
      const columnKey = columnName.toLowerCase()
      if (!IDENTIFIER.test(columnName)) {
        issues.push({ path: `classes.${classId}.attributes.${attributeIndex}.name`, message: 'El nombre de columna debe ser un identificador SQL seguro.' })
        continue
      }
      if (usedColumns.has(columnKey)) {
        issues.push({ path: `classes.${classId}.attributes.${attributeIndex}.name`, message: `La columna "${columnName}" está duplicada.` })
        continue
      }
      usedColumns.add(columnKey)
      const type = normalizeType(attribute.type)
      const isPrimaryKey = columnKey === 'id' && type === 'INTEGER'
      columns.push({ name: columnName, type, isPrimaryKey })
    }

    if (columns.length === 0) {
      issues.push({ path: `classes.${classId}.attributes`, message: 'Una tabla offline requiere al menos un atributo UML válido.' })
      continue
    }
    if (columns.filter((column) => column.isPrimaryKey).length > 1) {
      issues.push({ path: `classes.${classId}.attributes`, message: 'Una tabla solo puede tener una clave primaria.' })
      continue
    }
    tables.push({
      name: tableName,
      columns,
      primaryKey: columns.find((column) => column.isPrimaryKey)?.name,
    })
  }

  if (issues.length > 0) throw new OfflineValidationError('El UML no puede convertirse en un esquema SQLite seguro.', issues)

  const canonical = tables.map((table) => ({
    name: table.name,
    columns: table.columns.map(({ name, type, isPrimaryKey }) => ({ name, type, isPrimaryKey })),
  }))
  const schema: OfflineSchema = { version: 1, fingerprint: fingerprint(JSON.stringify(canonical)), tables }
  return { schema, createStatements: tables.map(createTableStatement) }
}

/**
 * Determines whether the requested schema can be applied onto an existing
 * database by only adding tables and columns (safe, non-destructive).
 *
 * @param schema      The newly requested OfflineSchema derived from the UML.
 * @param realTables  The actual structure currently persisted (PRAGMA table_info).
 * @returns The set of safe ALTER TABLE add-column statements plus a list of
 *          human-readable descriptions of destructive or ambiguous changes.
 */
export function compareSchemas(
  schema: OfflineSchema,
  realTables: Record<string, RealColumnInfo[]>,
): MigrationPlan {
  const safe: string[] = []
  const destructive: string[] = []
  const realNameToTable = new Map<string, string>()
  const requestedNames = new Set(schema.tables.map((table) => table.name.toLowerCase()))

  for (const name of Object.keys(realTables)) realNameToTable.set(name.toLowerCase(), name)

  for (const realName of realNameToTable.values()) {
    if (!requestedNames.has(realName.toLowerCase())) {
      destructive.push(`La tabla "${realName}" existe en la base pero ya no está en el UML.`)
    }
  }

  for (const table of schema.tables) {
    const realTableName = realNameToTable.get(table.name.toLowerCase())
    if (!realTableName) {
      safe.push(createTableStatement(table))
      continue
    }
    const realColumns = realTables[realTableName]
    const existing = new Set(realColumns.map((column) => column.name.toLowerCase()))
    for (const column of table.columns) {
      const existingColumn = realColumns.find((candidate) => candidate.name.toLowerCase() === column.name.toLowerCase())
      if (!existingColumn) {
        if (column.isPrimaryKey) {
          destructive.push(`La columna "${table.name}.${column.name}" se marca como nueva clave primaria en el UML y no puede agregarse con ALTER TABLE.`)
          continue
        }
        safe.push(`ALTER TABLE ${quoteIdentifier(table.name)} ADD COLUMN ${quoteIdentifier(column.name)} ${column.type}`)
        continue
      }
      existing.delete(column.name.toLowerCase())
      const realType = existingColumn.type.trim().toUpperCase()
      const requestedType = column.type
      if (realType !== requestedType) {
        destructive.push(`La columna "${table.name}.${column.name}" cambió de tipo "${existingColumn.type.trim()}" a "${requestedType}" en el UML.`)
      }
      if (column.isPrimaryKey !== (existingColumn.pk === 1)) {
        destructive.push(`La clave primaria de la columna "${table.name}.${column.name}" cambió en el UML.`)
      }
    }
    for (const leftover of existing) {
      const removed = realColumns.find((column) => column.name.toLowerCase() === leftover)
      destructive.push(`La columna "${table.name}.${removed!.name}" existe en la base pero ya no está en el UML.`)
    }
  }

  return { safe, destructive }
}
