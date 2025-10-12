import type {
  Bytes,
  ColumnSpec,
  DB,
  Query,
  SelectQuery,
  InformationSchemaTablesQuery,
} from "../types/index.ts";
import { OID } from "../types/index.ts";
import { DataRow } from "../protocol/messages.ts";
import { readdir, stat } from "node:fs/promises";

function inferOID(v: unknown): { oid: number; size: number } {
  switch (typeof v) {
    case "boolean":
      return { oid: OID.bool, size: 1 };
    case "number":
      return Number.isInteger(v)
        ? { oid: OID.int4, size: 4 }
        : { oid: OID.float8, size: 8 };
    case "string":
      return { oid: OID.text, size: -1 };
    case "object":
      if (v === null) return { oid: OID.text, size: -1 };
      return { oid: OID.text, size: -1 };
    default:
      return { oid: OID.text, size: -1 };
  }
}

function toTextCell(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export async function execPgDatabase(): Promise<{
  cols: ColumnSpec[];
  data: Bytes[];
  tag: string;
}> {
  // List all databases by scanning ./data/ directory
  const databases: string[] = [];

  try {
    const entries = await readdir("./data");
    for (const entry of entries) {
      const entryPath = `./data/${entry}`;
      try {
        const statInfo = await stat(entryPath);
        if (statInfo.isDirectory()) {
          databases.push(entry);
        }
      } catch {
        // Skip entries that can't be statted
      }
    }
  } catch {
    // If data directory doesn't exist, return empty list
  }

  databases.sort();

  // Standard pg_database columns (simplified)
  const cols: ColumnSpec[] = [
    { name: "datname", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "datdba", typeOID: OID.int4, typeSize: 4, format: 0 },
    { name: "encoding", typeOID: OID.int4, typeSize: 4, format: 0 },
  ];

  const data = databases.map(
    (dbName) => DataRow([dbName, "10", "6"]), // datdba=10 (postgres), encoding=6 (UTF8)
  );

  return { cols, data, tag: `SELECT ${databases.length}` };
}

export function execShowTables(db: DB): {
  cols: ColumnSpec[];
  data: Bytes[];
  tag: string;
} {
  // Collect all table names from all schemas
  const allTables: string[] = [];
  for (const schema of Object.values(db)) {
    allTables.push(...Object.keys(schema));
  }
  const tableNames = [...new Set(allTables)].sort();

  const cols: ColumnSpec[] = [
    { name: "Tables", typeOID: OID.text, typeSize: -1, format: 0 },
  ];

  const data = tableNames.map((name) => DataRow([name]));

  return { cols, data, tag: `SELECT ${tableNames.length}` };
}

export function execPgNamespace(db: DB): {
  cols: ColumnSpec[];
  data: Bytes[];
  tag: string;
} {
  // Get all schema names for pg_catalog.pg_namespace
  const schemaNames = Object.keys(db).sort();

  // pg_namespace columns (just nspname for the simple query)
  const cols: ColumnSpec[] = [
    { name: "nspname", typeOID: OID.text, typeSize: -1, format: 0 },
  ];

  const data = schemaNames.map((schemaName) => DataRow([schemaName]));

  return { cols, data, tag: `SELECT ${schemaNames.length}` };
}

export function execInformationSchemaSchemata(
  db: DB,
  dbName: string,
): { cols: ColumnSpec[]; data: Bytes[]; tag: string } {
  // Get all schema names
  const schemaNames = Object.keys(db).sort();

  // Standard information_schema.schemata columns
  const cols: ColumnSpec[] = [
    { name: "catalog_name", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "schema_name", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "schema_owner", typeOID: OID.text, typeSize: -1, format: 0 },
  ];

  const data = schemaNames.map((schemaName) =>
    DataRow([dbName, schemaName, "postgres"]),
  );

  return { cols, data, tag: `SELECT ${schemaNames.length}` };
}

export function execInformationSchemaTables(
  q: InformationSchemaTablesQuery,
  db: DB,
  dbName: string,
): { cols: ColumnSpec[]; data: Bytes[]; tag: string } {
  // Collect all tables from all schemas
  const allTables: Array<{ schema: string; table: string }> = [];

  for (const [schemaName, schema] of Object.entries(db)) {
    // Filter by schema if specified
    if (q.schemaFilter && schemaName !== q.schemaFilter) {
      continue;
    }

    for (const tableName of Object.keys(schema)) {
      allTables.push({ schema: schemaName, table: tableName });
    }
  }

  // Sort by schema then table name
  allTables.sort((a, b) => {
    if (a.schema !== b.schema) return a.schema.localeCompare(b.schema);
    return a.table.localeCompare(b.table);
  });

  // Standard information_schema.tables columns
  const cols: ColumnSpec[] = [
    { name: "table_catalog", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "table_schema", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "table_name", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "table_type", typeOID: OID.text, typeSize: -1, format: 0 },
  ];

  const data = allTables.map(({ schema, table }) =>
    DataRow([dbName, schema, table, "BASE TABLE"]),
  );

  return { cols, data, tag: `SELECT ${allTables.length}` };
}

export function execSelect(
  q: SelectQuery,
  db: DB,
): { cols: ColumnSpec[]; data: Bytes[]; tag: string } {
  const schemaName = q.schema ?? "public";
  const schema = db[schemaName];
  if (!schema) throw new Error(`schema "${schemaName}" does not exist`);

  const table = schema[q.table];
  if (!table)
    throw new Error(`relation "${schemaName}.${q.table}" does not exist`);

  let rows = table;
  if (q.where) {
    rows = rows.filter((r) => r[q.where!.col] === q.where!.value);
  }

  // Apply OFFSET and LIMIT
  const offset = q.offset ?? 0;
  const limit = q.limit;

  if (offset > 0) {
    rows = rows.slice(offset);
  }
  if (limit !== undefined) {
    rows = rows.slice(0, limit);
  }

  // Handle COUNT(*) queries
  if (q.isCountStar) {
    const cols: ColumnSpec[] = [
      { name: "count", typeOID: OID.int4, typeSize: 4, format: 0 },
    ];
    const data = [DataRow([String(rows.length)])];
    return { cols, data, tag: "SELECT 1" };
  }

  // Determine output columns
  let outCols: string[];
  if (q.columns === "*") {
    const first = rows[0] ?? {};
    outCols = Object.keys(first);
  } else {
    outCols = q.columns;
  }

  // Infer column types from sample row
  const sample = rows.find(Boolean) ?? {};
  const colsSpec: ColumnSpec[] = outCols.map((name) => {
    const { oid, size } = inferOID(sample[name]);
    return { name, typeOID: oid, typeSize: size, format: 0 };
  });

  // Build data rows
  const data = rows.map((r) =>
    DataRow(outCols.map((name) => toTextCell(r[name]))),
  );

  return { cols: colsSpec, data, tag: `SELECT ${rows.length}` };
}

export function execVersion(): {
  cols: ColumnSpec[];
  data: Bytes[];
  tag: string;
} {
  const cols: ColumnSpec[] = [
    { name: "version", typeOID: OID.text, typeSize: -1, format: 0 },
  ];
  const data = [
    DataRow([
      "PostgreSQL 16.0 (Prospect Park JSON Database) on x86_64-pc-linux-gnu, compiled by Bun, 64-bit",
    ]),
  ];
  return { cols, data, tag: "SELECT 1" };
}

export function execPgType(): {
  cols: ColumnSpec[];
  data: Bytes[];
  tag: string;
} {
  // Return empty result set with proper columns
  const cols: ColumnSpec[] = [
    { name: "oid", typeOID: OID.int4, typeSize: 4, format: 0 },
    { name: "typname", typeOID: OID.text, typeSize: -1, format: 0 },
  ];
  return { cols, data: [], tag: "SELECT 0" };
}

export function execPgClass(
  db: DB,
  isMaterializedViews: boolean,
): {
  cols: ColumnSpec[];
  data: Bytes[];
  tag: string;
} {
  const cols: ColumnSpec[] = [
    { name: "oid", typeOID: OID.int4, typeSize: 4, format: 0 },
    { name: "table_name", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "table_schema", typeOID: OID.text, typeSize: -1, format: 0 },
  ];

  // If looking for materialized views, return empty (we don't support them)
  if (isMaterializedViews) {
    return { cols, data: [], tag: "SELECT 0" };
  }

  // Return tables from pg_class with JOIN-like structure
  const allTables: Array<{ schema: string; table: string; oid: number }> = [];
  let oidCounter = 16384; // Start from typical user table OID

  for (const [schemaName, schema] of Object.entries(db)) {
    for (const tableName of Object.keys(schema)) {
      allTables.push({
        schema: schemaName,
        table: tableName,
        oid: oidCounter++,
      });
    }
  }

  allTables.sort((a, b) => {
    if (a.schema !== b.schema) return a.schema.localeCompare(b.schema);
    return a.table.localeCompare(b.table);
  });

  const data = allTables.map(({ oid, table, schema }) =>
    DataRow([String(oid), table, schema]),
  );

  return { cols, data, tag: `SELECT ${allTables.length}` };
}

export async function execQuery(
  query: Query,
  db: DB,
  dbName: string,
): Promise<{ cols: ColumnSpec[]; data: Bytes[]; tag: string }> {
  if ("type" in query) {
    if (query.type === "version") {
      return execVersion();
    }
    if (query.type === "pg_type") {
      return execPgType();
    }
    if (query.type === "pg_class") {
      return execPgClass(db, query.isMaterializedViews);
    }
    if (query.type === "show_tables") {
      return execShowTables(db);
    }
    if (query.type === "information_schema_tables") {
      return execInformationSchemaTables(query, db, dbName);
    }
    if (query.type === "information_schema_schemata") {
      return execInformationSchemaSchemata(db, dbName);
    }
    if (query.type === "pg_namespace") {
      return execPgNamespace(db);
    }
    if (query.type === "pg_database") {
      return await execPgDatabase();
    }
  }
  // Type narrowing: if it's not a special query type, it must be a SelectQuery
  return execSelect(query as SelectQuery, db);
}
