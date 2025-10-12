export type Bytes = Uint8Array;

// Bun TCP socket type for PostgreSQL connections
export type PgSocket = {
  data: unknown;
  write(data: Uint8Array | string): number;
  end(): void;
  remoteAddress?: string;
};

export type ColumnSpec = {
  name: string;
  typeOID: number;
  typeSize: number;
  format: 0 | 1;
};

export type Table = Array<Record<string, unknown>>;
export type Schema = Record<string, Table>; // table name -> rows
export type DB = Record<string, Schema>; // schema name -> tables

export type SelectQuery = {
  columns: "*" | string[];
  schema?: string; // defaults to "public"
  table: string;
  where?: { col: string; op: "="; value: string | number | boolean | null };
  limit?: number;
  offset?: number;
  isCountStar?: boolean;
};

export type ShowTablesQuery = {
  type: "show_tables";
};

export type InformationSchemaTablesQuery = {
  type: "information_schema_tables";
  schemaFilter?: string;
};

export type InformationSchemaSchemataQuery = {
  type: "information_schema_schemata";
};

export type PgNamespaceQuery = {
  type: "pg_namespace";
};

export type PgDatabaseQuery = {
  type: "pg_database";
};

export type VersionQuery = {
  type: "version";
};

export type PgTypeQuery = {
  type: "pg_type";
};

export type PgClassQuery = {
  type: "pg_class";
  isMaterializedViews: boolean;
};

export type Query =
  | SelectQuery
  | ShowTablesQuery
  | InformationSchemaTablesQuery
  | InformationSchemaSchemataQuery
  | PgNamespaceQuery
  | PgDatabaseQuery
  | VersionQuery
  | PgTypeQuery
  | PgClassQuery;

export type Prepared = { name: string; sql: string };
export type Portal = { name: string; stmtName: string };

export type ConnState = {
  dbName: string;
  buffer: Uint8Array;
  prepared: Map<string, Prepared>;
  portals: Map<string, Portal>;
  // Password authentication state
  awaitingPassword?: boolean;
  expectedUser?: string;
  expectedPassword?: string;
  authenticated?: boolean;
};

export const OID = { bool: 16, int4: 23, text: 25, float8: 701 } as const;
