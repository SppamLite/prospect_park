import type { PgSocket } from "./types/index.ts";
import {
  getConnection,
  handleStartup,
  handleStartupError,
} from "./handlers/connection.ts";
import {
  handleBind,
  handleClose,
  handleDescribe,
  handleExecute,
  handleParse,
  handleSimpleQuery,
  handleTerminate,
} from "./handlers/messages.ts";
import { handlePasswordMessage } from "./handlers/password.ts";
import { processFrontendMessages } from "./protocol/framing.ts";
import { concat, td } from "./utils/bytes.ts";
import {
  EmptyQueryResponse,
  ErrorResponse,
  ReadyForQuery,
} from "./protocol/messages.ts";
import { logger } from "./utils/logger.ts";

// Configuration from environment variables (Docker-compatible)
const PORT = Number(process.env.PORT ?? process.env.POSTGRES_PORT ?? 5432);
const HOST = process.env.HOST ?? "0.0.0.0";
const DEFAULT_DB = process.env.POSTGRES_DB ?? "postgres";

// Authentication (defaults to postgres/postgres like PostgreSQL)
const AUTH_USER = process.env.POSTGRES_USER ?? "postgres";
const AUTH_PASSWORD = process.env.POSTGRES_PASSWORD ?? "postgres";

Bun.listen<unknown>({
  hostname: HOST,
  port: PORT,
  socket: {
    open(_sock) {
      // Connection opened, wait for startup message
    },

    data(sock, incoming) {
      const pgSock = sock as unknown as PgSocket;
      const state = getConnection(pgSock);

      if (!state) {
        // Expect StartupMessage/SSLRequest/CancelRequest first
        handleStartup(pgSock, incoming, {
          defaultDb: DEFAULT_DB,
          authUser: AUTH_USER,
          authPassword: AUTH_PASSWORD,
        }).catch((err) => {
          handleStartupError(pgSock, err);
        });
        return;
      }

      // Post-startup: process frontend messages
      state.buffer = new Uint8Array([...state.buffer, ...incoming]);

      processFrontendMessages(pgSock, state, (type, payload) => {
        // Log incoming message
        if (type === "Q") {
          const sql = td.decode(payload.subarray(0, payload.length - 1));
          logger.info(
            { type, sql: sql.substring(0, 200), database: state.dbName },
            "Incoming message",
          );
        } else if (type === "P") {
          // Parse message - extract query
          const queryEnd = payload.indexOf(0, payload.indexOf(0) + 1);
          if (queryEnd > 0) {
            const query = td.decode(
              payload.slice(payload.indexOf(0) + 1, queryEnd),
            );
            logger.info(
              { type, query: query.substring(0, 200), database: state.dbName },
              "Incoming message",
            );
          } else {
            logger.info({ type, database: state.dbName }, "Incoming message");
          }
        } else {
          logger.info({ type, database: state.dbName }, "Incoming message");
        }

        // Handle password message during authentication
        if (type === "p" && state.awaitingPassword) {
          handlePasswordMessage(pgSock, state, payload);
          return;
        }

        // Reject queries if not yet authenticated
        if (!state.authenticated) {
          pgSock.write(
            concat([
              ErrorResponse("Authentication required", "28P01"),
              ReadyForQuery("E"),
            ]),
          );
          return;
        }

        switch (type) {
          case "X": // Terminate
            handleTerminate(pgSock);
            return;

          case "Q": {
            // Simple Query
            const sql = td.decode(payload.subarray(0, payload.length - 1));
            if (sql.trim() === "") {
              pgSock.write(concat([EmptyQueryResponse(), ReadyForQuery("I")]));
              return;
            }
            handleSimpleQuery(pgSock, state, sql);
            return;
          }

          case "P": // Parse
            handleParse(pgSock, state, payload);
            return;

          case "B": // Bind
            handleBind(pgSock, state, payload);
            return;

          case "D": // Describe
            handleDescribe(pgSock, state, payload);
            return;

          case "E": // Execute
            handleExecute(pgSock, state, payload);
            return;

          case "S": // Sync
            pgSock.write(ReadyForQuery("I"));
            return;

          case "H": // Flush
            // No-op for this implementation
            return;

          case "C": // Close
            handleClose(pgSock, state, payload);
            return;

          default:
            pgSock.write(
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
      // Connection closed
    },

    error(_sock, err) {
      logger.error({ err }, "Socket error");
    },
  },
});

logger.info(
  {
    host: HOST,
    port: PORT,
    defaultDb: DEFAULT_DB,
    authEnabled: true,
  },
  "Prospect Park server started",
);
