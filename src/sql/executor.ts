import type { Bytes, ColumnSpec, DB, SelectQuery } from "../types/index.ts";
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
  if (q.limit !== undefined) rows = rows.slice(0, q.limit);

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
