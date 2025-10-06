import type { ConnState, PgSocket } from "../types/index.ts";
import { concat, td } from "../utils/bytes.ts";
import {
  AuthenticationOk,
  BackendKeyData,
  ErrorResponse,
  ParameterStatus,
  ReadyForQuery,
} from "../protocol/messages.ts";
import { loadDB } from "../storage/json-store.ts";

const connections = new WeakMap<PgSocket, ConnState>();

export function getConnection(sock: PgSocket): ConnState | undefined {
  return connections.get(sock);
}

export async function handleStartup(
  sock: PgSocket,
  raw: Uint8Array,
): Promise<void> {
  // StartupMessage parsing: length(4) + protocol(4) + key\0val\0 ... \0
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const len = dv.getInt32(0, false);

  // Handle special requests
  if (len === 8) {
    const code = dv.getInt32(4, false);
    if (code === 80877103) {
      // SSLRequest -> respond 'N' (no SSL)
      sock.write(new Uint8Array([78]));
      return;
    }
    if (code === 80877102) {
      // CancelRequest - ignored
      return;
    }
  }

  // Parse startup parameters
  const payload = raw.subarray(8, len);
  const parts = td.decode(payload).split("\0").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const key = parts[i];
    const value = parts[i + 1];
    if (key && value) {
      params[key] = value;
    }
  }
  const dbName = params["database"] ?? params["user"] ?? "postgres";

  // Initialize connection state
  connections.set(sock, {
    dbName,
    buffer: new Uint8Array(0),
    prepared: new Map(),
    portals: new Map(),
  });

  // Warm cache (optional)
  await loadDB(dbName);

  // Send authentication success and server parameters
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

export async function handleStartupError(
  sock: PgSocket,
  err: unknown,
): Promise<void> {
  console.error("startup error", err);
  sock.write(concat([ErrorResponse("startup failed"), ReadyForQuery("E")]));
  try {
    sock.end();
  } catch {
    // Ignore close errors
  }
}
