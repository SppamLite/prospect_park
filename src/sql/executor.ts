import type {
  Bytes,
  ColumnSpec,
  DB,
  Query,
  SelectQuery,
  InformationSchemaQuery,
} from "../types/index.ts";
import { OID } from "../types/index.ts";
import { DataRow } from "../protocol/messages.ts";

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

export function execShowTables(db: DB): {
  cols: ColumnSpec[];
  data: Bytes[];
  tag: string;
} {
  const tableNames = Object.keys(db).sort();

  const cols: ColumnSpec[] = [
    { name: "Tables", typeOID: OID.text, typeSize: -1, format: 0 },
  ];

  const data = tableNames.map((name) => DataRow([name]));

  return { cols, data, tag: `SELECT ${tableNames.length}` };
}

export function execInformationSchemaTables(
  q: InformationSchemaQuery,
  db: DB,
  dbName: string,
): { cols: ColumnSpec[]; data: Bytes[]; tag: string } {
  const tableNames = Object.keys(db).sort();
  const schemaName = "public"; // Default schema name for now

  // Filter by schema if specified
  const filteredTables =
    q.schemaFilter && q.schemaFilter !== schemaName ? [] : tableNames;

  // Standard information_schema.tables columns
  const cols: ColumnSpec[] = [
    { name: "table_catalog", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "table_schema", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "table_name", typeOID: OID.text, typeSize: -1, format: 0 },
    { name: "table_type", typeOID: OID.text, typeSize: -1, format: 0 },
  ];

  const data = filteredTables.map((tableName) =>
    DataRow([dbName, schemaName, tableName, "BASE TABLE"]),
  );

  return { cols, data, tag: `SELECT ${filteredTables.length}` };
}

export function execSelect(
  q: SelectQuery,
  db: DB,
): { cols: ColumnSpec[]; data: Bytes[]; tag: string } {
  const table = db[q.table];
  if (!table) throw new Error(`relation "${q.table}" does not exist`);

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

export function execQuery(
  query: Query,
  db: DB,
  dbName: string,
): { cols: ColumnSpec[]; data: Bytes[]; tag: string } {
  if ("type" in query) {
    if (query.type === "show_tables") {
      return execShowTables(db);
    }
    if (query.type === "information_schema_tables") {
      return execInformationSchemaTables(query, db, dbName);
    }
  }
  // Type narrowing: if it's not a ShowTablesQuery or InformationSchemaQuery, it must be a SelectQuery
  return execSelect(query as SelectQuery, db);
}
