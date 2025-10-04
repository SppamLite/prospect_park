// Bun + TypeScript PostgreSQL v3 wire-protocol test server backed by JSON files.
// Data directory: ./data/<database>/*.json  (each file is a table: array of rows)
// Supports:
//  - Simple Query ('Q')
//  - Minimal Extended Query: Parse('P'), Bind('B'), Describe('D'), Execute('E'), Sync('S'), Flush('H'), Close('C')
//  - SELECT *|cols FROM table [WHERE col = <literal>] [LIMIT n];
//  - SELECT count(*) FROM table [...]
//
// Limitations: no TLS, no auth (AuthenticationOk), no parameters in prepared statements, tiny SQL subset.

type Bytes = Uint8Array;

const te = new TextEncoder();
const td = new TextDecoder();

/* -------------------- byte helpers -------------------- */
function be16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setInt16(0, n, false);
  return b;
}
function be32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n, false);
  return b;
}
function concat(parts: Bytes[]) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function z(s = ""): Bytes {
  return new Uint8Array([...te.encode(s), 0]);
}
function msg(type: string, payload: Bytes[]) {
  const body = concat(payload);
  return concat([te.encode(type), be32(body.length + 4), body]);
}

/* -------------------- protocol builders -------------------- */
function AuthenticationOk() {
  return msg("R", [be32(0)]);
}
function ParameterStatus(k: string, v: string) {
  return msg("S", [z(k), z(v)]);
}
function BackendKeyData(pid: number, secret: number) {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, pid, false);
  dv.setInt32(4, secret, false);
  return msg("K", [b]);
}
function ReadyForQuery(status: "I" | "T" | "E" = "I") {
  return msg("Z", [te.encode(status)]);
}
function CommandComplete(tag: string) {
  return msg("C", [z(tag)]);
}
function EmptyQueryResponse() {
  return msg("I", [
    /* empty */
  ]);
}
function NoticeResponse(text: string) {
  return msg("N", [
    te.encode("S"),
    z("NOTICE"),
    te.encode("M"),
    z(text),
    new Uint8Array([0]),
  ]);
}
function ErrorResponse(message: string, code = "XX000") {
  return msg("E", [
    te.encode("S"),
    z("ERROR"),
    te.encode("C"),
    z(code),
    te.encode("M"),
    z(message),
    new Uint8Array([0]),
  ]);
}

/* -------------------- row description / data -------------------- */
const OID = { bool: 16, int4: 23, text: 25, float8: 701 } as const;
type ColumnSpec = {
  name: string;
  typeOID: number;
  typeSize: number;
  format: 0 | 1;
};

function RowDescription(cols: ColumnSpec[]) {
  const parts: Bytes[] = [];
  parts.push(be16(cols.length));
  for (const col of cols) {
    parts.push(z(col.name));
    parts.push(be32(0)); // tableOID
    parts.push(be16(0)); // col attr #
    parts.push(be32(col.typeOID));
    parts.push(be16(col.typeSize)); // -1 variable, 4/8 fixed
    parts.push(be32(-1)); // typmod
    parts.push(be16(col.format));
  }
  return msg("T", parts);
}
function DataRow(values: (string | Bytes | null)[]) {
  const parts: Bytes[] = [];
  parts.push(be16(values.length));
  for (const v of values) {
    if (v === null) {
      parts.push(be32(-1));
      continue;
    }
    const bytes = typeof v === "string" ? te.encode(v) : v;
    parts.push(be32(bytes.length), bytes);
  }
  return msg("D", parts);
}

/* -------------------- JSON "storage" -------------------- */
type Table = Array<Record<string, unknown>>;
type DB = Record<string, Table>; // table name -> rows

const DB_CACHE = new Map<string, DB>();

async function loadDB(dbName: string): Promise<DB> {
  if (DB_CACHE.has(dbName)) return DB_CACHE.get(dbName)!;
  const fs = await import("node:fs/promises");
  const base = `./data/${dbName}`;
  let files: string[] = [];
  try {
    for await (const entry of await fs.opendir(base)) {
      if (entry.isFile() && entry.name.endsWith(".json"))
        files.push(entry.name);
    }
  } catch {
    DB_CACHE.set(dbName, {});
    return {};
  }
  const db: DB = {};
  for (const f of files) {
    const table = f.replace(/\.json$/i, "");
    try {
      const txt = await fs.readFile(`${base}/${f}`, "utf8");
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) db[table] = parsed;
    } catch {
      /* ignore bad file */
    }
  }
  DB_CACHE.set(dbName, db);
  return db;
}

/* -------------------- tiny SQL parser -------------------- */
type SelectQuery = {
  columns: "*" | string[];
  table: string;
  where?: { col: string; op: "="; value: string | number | boolean | null };
  limit?: number;
  isCountStar?: boolean;
};

function parseLiteral(lit: string): string | number | boolean | null {
  const s = lit.trim();
  if (/^null$/i.test(s)) return null;
  if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^'(.*)'$/s);
  if (m) return m[1].replace(/''/g, "'");
  return s; // bare word -> string
}

function parseSelect(sqlRaw: string): SelectQuery | null {
  const sql = sqlRaw.trim().replace(/;$/, "");
  const countRe =
    /^select\s+count\(\s*\*\s*\)\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^ ]+))?\s*(?:limit\s+(\d+))?$/i;
  let m = sql.match(countRe);
  if (m) {
    const [, table, wcol, wval, lim] = m;
    const q: SelectQuery = { columns: "*", table, isCountStar: true };
    if (wcol && wval)
      q.where = { col: wcol, op: "=", value: parseLiteral(wval) };
    if (lim) q.limit = Number(lim);
    return q;
  }
  const re =
    /^select\s+(.+)\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^ ]+))?\s*(?:limit\s+(\d+))?$/i;
  m = sql.match(re);
  if (!m) return null;
  const [, cols, table, wcol2, wval2, lim2] = m;
  const columns =
    cols.trim() === "*" ? "*" : cols.split(",").map((s) => s.trim());
  const q: SelectQuery = { columns, table };
  if (wcol2 && wval2)
    q.where = { col: wcol2, op: "=", value: parseLiteral(wval2) };
  if (lim2) q.limit = Number(lim2);
  return q;
}

/* -------------------- execution over JSON -------------------- */
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

function execSelect(q: SelectQuery, db: DB) {
  const table = db[q.table];
  if (!table) throw new Error(`relation "${q.table}" does not exist`);

  let rows = table;
  if (q.where)
    rows = rows.filter((r) => (r as any)[q.where!.col] === q.where!.value);
  if (q.limit !== undefined) rows = rows.slice(0, q.limit);

  if (q.isCountStar) {
    const cols: ColumnSpec[] = [
      { name: "count", typeOID: OID.int4, typeSize: 4, format: 0 },
    ];
    const data = [DataRow([String(rows.length)])];
    return { cols, data, tag: "SELECT 1" };
  }

  let outCols: string[];
  if (q.columns === "*") {
    const first = rows[0] ?? {};
    outCols = Object.keys(first);
  } else outCols = q.columns;

  const sample = rows.find(Boolean) ?? {};
  const colsSpec: ColumnSpec[] = outCols.map((name) => {
    const { oid, size } = inferOID((sample as any)[name]);
    return { name, typeOID: oid, typeSize: size as any, format: 0 };
  });

  const data = rows.map((r) =>
    DataRow(outCols.map((name) => toTextCell((r as any)[name]))),
  );
  return { cols: colsSpec, data, tag: `SELECT ${rows.length}` };
}

/* -------------------- connection state & framing -------------------- */
type Prepared = { name: string; sql: string };
type Portal = { name: string; stmtName: string };

type ConnState = {
  dbName: string;
  buffer: Uint8Array;
  prepared: Map<string, Prepared>; // name -> stmt
  portals: Map<string, Portal>; // name -> portal
};

const connections = new WeakMap<any, ConnState>();

function appendBuffer(oldB: Uint8Array, inc: Uint8Array) {
  const out = new Uint8Array(oldB.length + inc.length);
  out.set(oldB, 0);
  out.set(inc, oldB.length);
  return out;
}

function processFrontendMessages(
  sock: any,
  state: ConnState,
  onMessage: (type: string, payload: Uint8Array) => void,
) {
  let buf = state.buffer;
  while (buf.length >= 5) {
    const type = String.fromCharCode(buf[0]);
    const len = new DataView(buf.buffer, buf.byteOffset + 1, 4).getInt32(
      0,
      false,
    );
    const total = 1 + 4 + (len - 4);
    if (buf.length < total) break;
    const payload = buf.subarray(5, total);
    onMessage(type, payload);
    buf = buf.subarray(total);
  }
  state.buffer = buf;
}

/* -------------------- frontend message parsers -------------------- */
function readCString(
  buf: Uint8Array,
  offset: number,
): { s: string; next: number } {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const s = td.decode(buf.subarray(offset, end));
  return { s, next: end + 1 };
}

async function handleStartup(sock: any, raw: Uint8Array) {
  // StartupMessage parsing: length(4) + protocol(4) + key\0val\0 ... \0
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const len = dv.getInt32(0, false);
  if (len === 8) {
    const code = dv.getInt32(4, false);
    if (code === 80877103) {
      sock.write(new Uint8Array([78]));
      return;
    } // SSLRequest -> 'N'
    if (code === 80877102) {
      /* CancelRequest ignored */ return;
    }
  }
  const payload = raw.subarray(8, len);
  const parts = td.decode(payload).split("\0").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i + 1 < parts.length; i += 2) params[parts[i]] = parts[i + 1];
  const dbName = params.database ?? params.user ?? "postgres";

  // init connection state
  connections.set(sock, {
    dbName,
    buffer: new Uint8Array(0),
    prepared: new Map(),
    portals: new Map(),
  });
  await loadDB(dbName); // warm cache (optional)

  sock.write(
    concat([
      AuthenticationOk(),
      ParameterStatus("server_version", "16.0"),
      ParameterStatus("client_encoding", "UTF8"),
      ParameterStatus("standard_conforming_strings", "on"),
      ParameterStatus("TimeZone", "UTC"),
      BackendKeyData(
        Math.floor(Math.random() * 1e6),
        Math.floor(Math.random() * 1e6),
      ),
      ReadyForQuery("I"),
    ]),
  );
}

/* -------------------- execute SQL -------------------- */
async function runSQL(sock: any, st: ConnState, sql: string) {
  // Built-in SELECT 1
  if (/^\s*select\s+1\s*;?\s*$/i.test(sql)) {
    const cols = RowDescription([
      { name: "?column?", typeOID: OID.int4, typeSize: 4, format: 0 },
    ]);
    sock.write(
      concat([
        cols,
        DataRow(["1"]),
        CommandComplete("SELECT 1"),
        ReadyForQuery("I"),
      ]),
    );
    return;
  }
  const db = await loadDB(st.dbName);
  const parsed = parseSelect(sql);
  if (!parsed) {
    sock.write(
      concat([
        ErrorResponse(`Unsupported or malformed query: ${sql}`),
        ReadyForQuery("E"),
      ]),
    );
    return;
  }
  try {
    const res = execSelect(parsed, db);
    sock.write(
      concat([
        RowDescription(res.cols),
        ...res.data,
        CommandComplete(res.tag),
        ReadyForQuery("I"),
      ]),
    );
  } catch (e: any) {
    sock.write(
      concat([
        ErrorResponse(e?.message ?? "internal error"),
        ReadyForQuery("E"),
      ]),
    );
  }
}

/* -------------------- Bun TCP server -------------------- */
const PORT = Number(process.env.PORT ?? 7878);

Bun.listen({
  hostname: "0.0.0.0",
  port: PORT,
  socket: {
    open(_sock) {
      /* no-op */
    },
    data(sock, incoming) {
      const st = connections.get(sock);
      if (!st) {
        // Expect Startup/SSLRequest/CancelRequest first
        handleStartup(sock, incoming).catch((err) => {
          console.error("startup error", err);
          sock.write(
            concat([ErrorResponse("startup failed"), ReadyForQuery("E")]),
          );
          try {
            sock.end();
          } catch {}
        });
        return;
      }

      // Post-startup
      st.buffer = appendBuffer(st.buffer, incoming);
      processFrontendMessages(sock, st, (type, payload) => {
        switch (type) {
          case "X": // Terminate
            try {
              sock.end();
            } catch {}
            return;

          case "Q": {
            // Simple Query
            const sql = td.decode(payload.subarray(0, payload.length - 1)); // NUL-terminated
            if (sql.trim() === "") {
              sock.write(concat([EmptyQueryResponse(), ReadyForQuery("I")]));
              return;
            }
            runSQL(sock, st, sql);
            return;
          }

          // Extended protocol: Parse
          case "P": {
            // [statementName]\0 [query]\0 paramCount(int16) [paramOIDs...]
            let off = 0;
            const r1 = readCString(payload, off);
            const stmt = r1.s;
            off = r1.next;
            const r2 = readCString(payload, off);
            const query = r2.s;
            off = r2.next;
            const paramCount = new DataView(
              payload.buffer,
              payload.byteOffset + off,
              2,
            ).getInt16(0, false);
            off += 2;
            // Ignore OIDs; we don't support parameters anyway
            if (paramCount > 0) {
              sock.write(
                concat([
                  ErrorResponse(
                    "parameters not supported in prepared statements",
                  ),
                  ReadyForQuery("E"),
                ]),
              );
              return;
            }
            st.prepared.set(stmt, { name: stmt, sql: query });
            // ParseComplete
            sock.write(msg("1", []));
            return;
          }

          // Bind: create a portal for a prepared statement
          case "B": {
            let off = 0;
            const rPortal = readCString(payload, off);
            const portal = rPortal.s;
            off = rPortal.next;
            const rStmt = readCString(payload, off);
            const stmt = rStmt.s;
            off = rStmt.next;

            const dv = new DataView(payload.buffer, payload.byteOffset);
            const fmtCount = dv.getInt16(off, false);
            off += 2;
            off += fmtCount * 2; // skip param formats

            const paramCount = dv.getInt16(off, false);
            off += 2;
            // Read param values (and ignore—unsupported)
            for (let i = 0; i < paramCount; i++) {
              const n = dv.getInt32(off, false);
              off += 4;
              if (n >= 0) off += n;
            }
            const resFmtCount = dv.getInt16(off, false);
            off += 2;
            off += resFmtCount * 2; // skip result formats

            if (!st.prepared.has(stmt)) {
              sock.write(
                concat([
                  ErrorResponse(`prepared statement "${stmt}" does not exist`),
                  ReadyForQuery("E"),
                ]),
              );
              return;
            }
            if (paramCount > 0) {
              sock.write(
                concat([
                  ErrorResponse(
                    "parameters not supported in prepared statements",
                  ),
                  ReadyForQuery("E"),
                ]),
              );
              return;
            }
            st.portals.set(portal, { name: portal, stmtName: stmt });
            // BindComplete
            sock.write(msg("2", []));
            return;
          }

          // Describe: of portal ('P') or statement ('S')
          case "D": {
            const kind = String.fromCharCode(payload[0]); // 'S' or 'P'
            const r = readCString(payload, 1);
            const name = r.s;

            let sql: string | undefined;
            if (kind === "S") {
              sql = st.prepared.get(name)?.sql;
            } else if (kind === "P") {
              const portal = st.portals.get(name);
              if (portal) sql = st.prepared.get(portal.stmtName)?.sql;
            }
            if (!sql) {
              // No such stmt/portal -> send NoData
              sock.write(msg("n", []));
              return;
            }

            const parsed = parseSelect(sql);
            if (!parsed) {
              sock.write(msg("n", []));
              return;
            }
            // Build a RowDescription from current DB (best-effort)
            loadDB(st.dbName).then((db) => {
              try {
                const res = execSelect({ ...parsed, limit: 0 }, db);
                // Empty data but RowDescription with columns
                sock.write(RowDescription(res.cols));
              } catch {
                // If table missing, still send NoData
                sock.write(msg("n", []));
              }
            });
            return;
          }

          // Execute: run the SQL behind the portal
          case "E": {
            const r = readCString(payload, 0);
            const portal = r.s;
            // maxRows (int32) follows—but we ignore it
            const p = st.portals.get(portal);
            if (!p) {
              sock.write(
                concat([
                  ErrorResponse(`portal "${portal}" does not exist`),
                  ReadyForQuery("E"),
                ]),
              );
              return;
            }
            const sql = st.prepared.get(p.stmtName)?.sql;
            if (!sql) {
              sock.write(
                concat([
                  ErrorResponse(`prepared statement "${p.stmtName}" missing`),
                  ReadyForQuery("E"),
                ]),
              );
              return;
            }
            runSQL(sock, st, sql);
            return;
          }

          // Sync: end of extended query cycle -> ReadyForQuery
          case "S":
            sock.write(ReadyForQuery("I"));
            return;

          // Flush: no-op for us
          case "H":
            return;

          // Close: statement ('S') or portal ('P')
          case "C": {
            const kind = String.fromCharCode(payload[0]);
            const r = readCString(payload, 1);
            const name = r.s;
            if (kind === "S") st.prepared.delete(name);
            else if (kind === "P") st.portals.delete(name);
            // CloseComplete
            sock.write(msg("3", []));
            return;
          }

          default:
            sock.write(
              concat([
                ErrorResponse(`unsupported message type '${type}'`),
                ReadyForQuery("E"),
              ]),
            );
            return;
        }
      });
    },
    close(_sock) {
      /* no-op */
    },
    error(_sock, err) {
      console.error("socket error:", err);
    },
  },
});

console.log(
  `prospect park listening on 0.0.0.0:${PORT}  (data dir: ./data/<db>/*.json)`,
);
