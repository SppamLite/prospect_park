import type { ConnState, PgSocket } from "../types/index.ts";
import { appendBuffer } from "../utils/bytes.ts";

/**
 * Process buffered frontend messages and invoke callback for each complete message
 */
export function processFrontendMessages(
  sock: PgSocket,
  state: ConnState,
  onMessage: (type: string, payload: Uint8Array) => void,
): void {
  let buf = state.buffer;

  while (buf.length >= 5) {
    const type = String.fromCharCode(buf[0]!);
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

/**
 * Append incoming data to connection buffer
 */
export function appendToBuffer(state: ConnState, incoming: Uint8Array): void {
  state.buffer = appendBuffer(state.buffer, incoming);
}
