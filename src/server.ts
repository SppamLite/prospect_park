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
import { processFrontendMessages } from "./protocol/framing.ts";
import { concat, td } from "./utils/bytes.ts";
import {
  EmptyQueryResponse,
  ErrorResponse,
  ReadyForQuery,
} from "./protocol/messages.ts";

const PORT = Number(process.env.PORT ?? 7878);

Bun.listen({
  hostname: "localhost",
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
        handleStartup(pgSock, incoming).catch((err) => {
          handleStartupError(pgSock, err);
        });
        return;
      }

      // Post-startup: process frontend messages
      state.buffer = new Uint8Array([...state.buffer, ...incoming]);

      processFrontendMessages(pgSock, state, (type, payload) => {
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
      console.error("socket error:", err);
    },
  },
});

console.log(
  `Prospect Park listening on 0.0.0.0:${PORT}  (data dir: ./data/<db>/*.json)`,
);
