import type { ConnState, PgSocket } from "../types/index.ts";
import { concat, td } from "../utils/bytes.ts";
import {
  AuthenticationOk,
  BackendKeyData,
  ErrorResponse,
  ParameterStatus,
  ReadyForQuery,
} from "../protocol/messages.ts";
import { logger } from "../utils/logger.ts";

export function handlePasswordMessage(
  sock: PgSocket,
  state: ConnState,
  payload: Uint8Array,
): void {
  // Password message format: password string (null-terminated)
  const password = td.decode(payload.subarray(0, payload.length - 1));

  // Validate password
  if (state.expectedPassword && password !== state.expectedPassword) {
    logger.warn(
      {
        user: state.expectedUser,
        remoteAddress: sock.remoteAddress,
      },
      "Authentication failed - invalid password",
    );
    sock.write(
      concat([
        ErrorResponse(
          `authentication failed for user "${state.expectedUser}"`,
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

  // Password matches! Complete authentication
  state.awaitingPassword = false;
  state.authenticated = true;

  logger.info(
    {
      user: state.expectedUser,
      database: state.dbName,
      remoteAddress: sock.remoteAddress,
    },
    "Client authenticated successfully",
  );

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
