import type {
  Query,
  SelectQuery,
  ShowTablesQuery,
  InformationSchemaTablesQuery,
  InformationSchemaSchemataQuery,
  PgNamespaceQuery,
  PgDatabaseQuery,
  VersionQuery,
  PgTypeQuery,
  PgClassQuery,
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

  // Check for SELECT version()
  if (/^select\s+version\(\s*\)\s*$/i.test(sql)) {
    const query: VersionQuery = { type: "version" };
    return query;
  }

  // Check for pg_type queries (return empty result set)
  if (/^select\s+.*\s+from\s+pg_type/i.test(sql)) {
    const query: PgTypeQuery = { type: "pg_type" };
    return query;
  }

  // Check for pg_class queries (for table listing with JOINs)
  // Check if it's looking for materialized views (relkind = 'm')
  if (/WHERE c\.relkind\s*=\s*'m'/i.test(sql)) {
    // Materialized views query - we don't support these, return empty
    const query: PgClassQuery = { type: "pg_class", isMaterializedViews: true };
    return query;
  }

  if (
    /^select\s+.*\s+from\s+pg_catalog\.pg_class/i.test(sql) ||
    /^select\s+.*\s+from\s+pg_class/i.test(sql)
  ) {
    const query: PgClassQuery = {
      type: "pg_class",
      isMaterializedViews: false,
    };
    return query;
  }

  // Check for SHOW TABLES
  if (/^show\s+tables\s*$/i.test(sql)) {
    const query: ShowTablesQuery = { type: "show_tables" };
    return query;
  }

  // Check for pg_database queries (for database list)
  if (
    /^select\s+.*\s+from\s+pg_catalog\.pg_database/i.test(sql) ||
    /^select\s+.*\s+from\s+pg_database/i.test(sql)
  ) {
    const query: PgDatabaseQuery = {
      type: "pg_database",
    };
    return query;
  }

  // Check for information_schema.schemata queries (for schema list)
  if (/^select\s+.*\s+from\s+information_schema\.schemata/i.test(sql)) {
    const query: InformationSchemaSchemataQuery = {
      type: "information_schema_schemata",
    };
    return query;
  }

  // Check for pg_catalog.pg_namespace queries (alternative for schema list)
  if (/^select\s+.*\s+from\s+pg_catalog\.pg_namespace/i.test(sql)) {
    const query: PgNamespaceQuery = {
      type: "pg_namespace",
    };
    return query;
  }

  // Check for information_schema.tables queries (common in GUI clients)
  // Match: SELECT ... FROM information_schema.tables [WHERE table_schema = 'schema']
  const infoSchemaRe =
    /^select\s+.*\s+from\s+information_schema\.tables(?:\s+where\s+table_schema\s*=\s*'([^']+)')?/i;
  let m = sql.match(infoSchemaRe);
  if (m) {
    const schemaFilter = m[1];
    const query: InformationSchemaTablesQuery = {
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
    const query: InformationSchemaTablesQuery = {
      type: "information_schema_tables",
      schemaFilter,
    };
    return query;
  }

  // Helper to extract schema and table name from qualified name
  const parseQualifiedName = (
    qualifiedName: string,
  ): { schema: string; table: string } => {
    // Remove quotes and extract schema.table from "schema"."table" or schema.table
    const parts = qualifiedName.split(".");

    if (parts.length === 1) {
      // Just table name, use default schema
      const table = parts[0]!.replace(/^"(.+)"$/, "$1");
      return { schema: "public", table };
    }

    // schema.table
    const schema = parts[0]!.replace(/^"(.+)"$/, "$1");
    const table = parts[1]!.replace(/^"(.+)"$/, "$1");
    return { schema, table };
  };

  // Check for COUNT(*) query
  // Supports: schema.table or "schema"."table"
  const countRe =
    /^select\s+count\(\s*\*\s*\)\s+from\s+((?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?(?:"?[a-zA-Z_][a-zA-Z0-9_]*"?))\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^ ]+))?\s*(?:limit\s+(\d+))?\s*(?:offset\s+(\d+))?$/i;
  m = sql.match(countRe);
  if (m) {
    const qualifiedName = m[1];
    const wcol = m[2];
    const wval = m[3];
    const lim = m[4];
    const off = m[5];
    if (!qualifiedName) return null;
    const { schema, table } = parseQualifiedName(qualifiedName);
    const q: SelectQuery = { columns: "*", schema, table, isCountStar: true };
    if (wcol && wval)
      q.where = { col: wcol, op: "=", value: parseLiteral(wval) };
    if (lim) q.limit = Number(lim);
    if (off) q.offset = Number(off);
    return q;
  }

  // Regular SELECT query
  // Supports: schema.table or "schema"."table", LIMIT, and OFFSET
  const re =
    /^select\s+(.+?)\s+from\s+((?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?(?:"?[a-zA-Z_][a-zA-Z0-9_]*"?))\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^ ]+))?\s*(?:limit\s+(\d+))?\s*(?:offset\s+(\d+))?$/i;
  m = sql.match(re);
  if (!m) return null;

  const cols = m[1];
  const qualifiedName = m[2];
  const wcol2 = m[3];
  const wval2 = m[4];
  const lim2 = m[5];
  const off2 = m[6];

  if (!cols || !qualifiedName) return null;

  const { schema, table } = parseQualifiedName(qualifiedName);
  const columns =
    cols.trim() === "*" ? "*" : cols.split(",").map((s) => s.trim());
  const q: SelectQuery = { columns, schema, table };
  if (wcol2 && wval2)
    q.where = { col: wcol2, op: "=", value: parseLiteral(wval2) };
  if (lim2) q.limit = Number(lim2);
  if (off2) q.offset = Number(off2);
  return q;
}
