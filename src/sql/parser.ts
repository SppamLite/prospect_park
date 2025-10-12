import type {
  Query,
  SelectQuery,
  ShowTablesQuery,
  InformationSchemaQuery,
} from "../types/index.ts";

function parseLiteral(lit: string): string | number | boolean | null {
  const s = lit.trim();
  if (/^null$/i.test(s)) return null;
  if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^'(.*)'$/s);
  if (m && m[1] !== undefined) return m[1].replace(/''/g, "'");
  return s; // bare word -> string
}

export function parseQuery(sqlRaw: string): Query | null {
  const sql = sqlRaw.trim().replace(/;$/, "");

  // Check for SHOW TABLES
  if (/^show\s+tables\s*$/i.test(sql)) {
    const query: ShowTablesQuery = { type: "show_tables" };
    return query;
  }

  // Check for information_schema.tables queries (common in GUI clients)
  // Match: SELECT ... FROM information_schema.tables [WHERE table_schema = 'schema']
  const infoSchemaRe =
    /^select\s+.*\s+from\s+information_schema\.tables(?:\s+where\s+table_schema\s*=\s*'([^']+)')?/i;
  let m = sql.match(infoSchemaRe);
  if (m) {
    const schemaFilter = m[1];
    const query: InformationSchemaQuery = {
      type: "information_schema_tables",
      schemaFilter,
    };
    return query;
  }

  // Check for pg_catalog.pg_tables queries
  const pgTablesRe =
    /^select\s+.*\s+from\s+pg_catalog\.pg_tables(?:\s+where\s+schemaname\s*=\s*'([^']+)')?/i;
  m = sql.match(pgTablesRe);
  if (m) {
    const schemaFilter = m[1];
    const query: InformationSchemaQuery = {
      type: "information_schema_tables",
      schemaFilter,
    };
    return query;
  }

  // Helper to extract table name from qualified name (removes schema prefix and quotes)
  const extractTableName = (qualifiedName: string): string => {
    // Remove quotes and extract table name from "schema"."table" or schema.table
    const parts = qualifiedName.split(".");
    const tableName = parts[parts.length - 1]!;
    return tableName.replace(/^"(.+)"$/, "$1");
  };

  // Check for COUNT(*) query
  // Supports: schema.table or "schema"."table"
  const countRe =
    /^select\s+count\(\s*\*\s*\)\s+from\s+(?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^ ]+))?\s*(?:limit\s+(\d+))?\s*(?:offset\s+(\d+))?$/i;
  m = sql.match(countRe);
  if (m) {
    const tableRaw = m[1];
    const wcol = m[2];
    const wval = m[3];
    const lim = m[4];
    const off = m[5];
    if (!tableRaw) return null;
    const table = extractTableName(tableRaw);
    const q: SelectQuery = { columns: "*", table, isCountStar: true };
    if (wcol && wval)
      q.where = { col: wcol, op: "=", value: parseLiteral(wval) };
    if (lim) q.limit = Number(lim);
    if (off) q.offset = Number(off);
    return q;
  }

  // Regular SELECT query
  // Supports: schema.table or "schema"."table", LIMIT, and OFFSET
  const re =
    /^select\s+(.+?)\s+from\s+(?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^ ]+))?\s*(?:limit\s+(\d+))?\s*(?:offset\s+(\d+))?$/i;
  m = sql.match(re);
  if (!m) return null;

  const cols = m[1];
  const tableRaw = m[2];
  const wcol2 = m[3];
  const wval2 = m[4];
  const lim2 = m[5];
  const off2 = m[6];

  if (!cols || !tableRaw) return null;

  const table = extractTableName(tableRaw);
  const columns =
    cols.trim() === "*" ? "*" : cols.split(",").map((s) => s.trim());
  const q: SelectQuery = { columns, table };
  if (wcol2 && wval2)
    q.where = { col: wcol2, op: "=", value: parseLiteral(wval2) };
  if (lim2) q.limit = Number(lim2);
  if (off2) q.offset = Number(off2);
  return q;
}
