import type { ConnState, PgSocket } from "../types/index.ts";
import { OID } from "../types/index.ts";
import { concat, readCString, td } from "../utils/bytes.ts";
import {
  BindComplete,
  CloseComplete,
  CommandComplete,
  DataRow,
  EmptyQueryResponse,
  ErrorResponse,
  NoData,
  ParseComplete,
  ReadyForQuery,
  RowDescription,
} from "../protocol/messages.ts";
import { parseSelect } from "../sql/parser.ts";
import { execSelect } from "../sql/executor.ts";
import { loadDB } from "../storage/json-store.ts";

export async function handleSimpleQuery(
  sock: PgSocket,
  state: ConnState,
  sql: string,
): Promise<void> {
  // Built-in SELECT 1 for connection testing
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

  const db = await loadDB(state.dbName);
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "internal error";
    sock.write(concat([ErrorResponse(message), ReadyForQuery("E")]));
  }
}

export function handleParse(
  sock: PgSocket,
  state: ConnState,
  payload: Uint8Array,
): void {
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

  if (paramCount > 0) {
    sock.write(
      concat([
        ErrorResponse("parameters not supported in prepared statements"),
        ReadyForQuery("E"),
      ]),
    );
    return;
  }

  state.prepared.set(stmt, { name: stmt, sql: query });
  sock.write(ParseComplete());
}

export function handleBind(
  sock: PgSocket,
  state: ConnState,
  payload: Uint8Array,
): void {
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

  if (!state.prepared.has(stmt)) {
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
        ErrorResponse("parameters not supported in prepared statements"),
        ReadyForQuery("E"),
      ]),
    );
    return;
  }

  state.portals.set(portal, { name: portal, stmtName: stmt });
  sock.write(BindComplete());
}

export async function handleDescribe(
  sock: PgSocket,
  state: ConnState,
  payload: Uint8Array,
): Promise<void> {
  const kind = String.fromCharCode(payload[0]!); // 'S' or 'P'
  const r = readCString(payload, 1);
  const name = r.s;

  let sql: string | undefined;
  if (kind === "S") {
    sql = state.prepared.get(name)?.sql;
  } else if (kind === "P") {
    const portal = state.portals.get(name);
    if (portal) sql = state.prepared.get(portal.stmtName)?.sql;
  }

  if (!sql) {
    sock.write(NoData());
    return;
  }

  const parsed = parseSelect(sql);
  if (!parsed) {
    sock.write(NoData());
    return;
  }

  // Build a RowDescription from current DB (best-effort)
  try {
    const db = await loadDB(state.dbName);
    const res = execSelect({ ...parsed, limit: 0 }, db);
    sock.write(RowDescription(res.cols));
  } catch {
    sock.write(NoData());
  }
}

export async function handleExecute(
  sock: PgSocket,
  state: ConnState,
  payload: Uint8Array,
): Promise<void> {
  const r = readCString(payload, 0);
  const portal = r.s;

  const p = state.portals.get(portal);
  if (!p) {
    sock.write(
      concat([
        ErrorResponse(`portal "${portal}" does not exist`),
        ReadyForQuery("E"),
      ]),
    );
    return;
  }

  const sql = state.prepared.get(p.stmtName)?.sql;
  if (!sql) {
    sock.write(
      concat([
        ErrorResponse(`prepared statement "${p.stmtName}" missing`),
        ReadyForQuery("E"),
      ]),
    );
    return;
  }

  await handleSimpleQuery(sock, state, sql);
}

export function handleClose(
  sock: PgSocket,
  state: ConnState,
  payload: Uint8Array,
): void {
  const kind = String.fromCharCode(payload[0]!);
  const r = readCString(payload, 1);
  const name = r.s;

  if (kind === "S") {
    state.prepared.delete(name);
  } else if (kind === "P") {
    state.portals.delete(name);
  }

  sock.write(CloseComplete());
}

export function handleTerminate(sock: PgSocket): void {
  try {
    sock.end();
  } catch {
    // Ignore close errors
  }
}
