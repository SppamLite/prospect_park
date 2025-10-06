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
export type DB = Record<string, Table>; // table name -> rows

export type SelectQuery = {
  columns: "*" | string[];
  table: string;
  where?: { col: string; op: "="; value: string | number | boolean | null };
  limit?: number;
  isCountStar?: boolean;
};

export type Prepared = { name: string; sql: string };
export type Portal = { name: string; stmtName: string };

export type ConnState = {
  dbName: string;
  buffer: Uint8Array;
  prepared: Map<string, Prepared>;
  portals: Map<string, Portal>;
};

export const OID = { bool: 16, int4: 23, text: 25, float8: 701 } as const;
