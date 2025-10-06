import type { ConnState, PgSocket } from "../types/index.ts";
import { concat, td } from "../utils/bytes.ts";
import { ErrorResponse, ReadyForQuery } from "../protocol/messages.ts";
import { logger } from "../utils/logger.ts";

const connections = new WeakMap<PgSocket, ConnState>();

export function getConnection(sock: PgSocket): ConnState | undefined {
  return connections.get(sock);
}

export type StartupConfig = {
  defaultDb?: string;
  authUser?: string;
  authPassword?: string;
};

export async function handleStartup(
  sock: PgSocket,
  raw: Uint8Array,
  config?: StartupConfig,
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
  const dbName =
    params["database"] ?? params["user"] ?? config?.defaultDb ?? "postgres";
  const providedUser = params["user"] ?? "";

  // Check username first
  if (config?.authUser && providedUser !== config.authUser) {
    logger.warn(
      { user: providedUser, remoteAddress: sock.remoteAddress },
      "Authentication failed - invalid username",
    );
    sock.write(
      concat([
        ErrorResponse(
          `authentication failed for user "${providedUser}"`,
          "28P01",
        ),
      ]),
    );
    try {
      sock.end();
    } catch {
      // Ignore close errors
    }
    return;
  }

  // Initialize connection state and request password
  connections.set(sock, {
    dbName,
    buffer: new Uint8Array(0),
    prepared: new Map(),
    portals: new Map(),
    awaitingPassword: true,
    expectedUser: providedUser,
    expectedPassword: config?.authPassword,
    authenticated: false,
  });

  // Send AuthenticationCleartextPassword request
  // Message: 'R' + length(8) + type(3 for cleartext password)
  const authRequest = new Uint8Array(9);
  authRequest[0] = 82; // 'R'
  new DataView(authRequest.buffer).setInt32(1, 8, false); // length = 8
  new DataView(authRequest.buffer).setInt32(5, 3, false); // type = 3 (cleartext)
  sock.write(authRequest);
}

export async function handleStartupError(
  sock: PgSocket,
  err: unknown,
): Promise<void> {
  logger.error({ err }, "Startup error");
  sock.write(concat([ErrorResponse("startup failed"), ReadyForQuery("E")]));
  try {
    sock.end();
  } catch {
    // Ignore close errors
  }
}
