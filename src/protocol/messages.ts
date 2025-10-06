import type { Bytes, ColumnSpec } from "../types/index.ts";
import { be16, be32, msg, te, z } from "../utils/bytes.ts";

export function AuthenticationOk(): Bytes {
  return msg("R", [be32(0)]);
}

export function ParameterStatus(k: string, v: string): Bytes {
  return msg("S", [z(k), z(v)]);
}

export function BackendKeyData(pid: number, secret: number): Bytes {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, pid, false);
  dv.setInt32(4, secret, false);
  return msg("K", [b]);
}

export function ReadyForQuery(status: "I" | "T" | "E" = "I"): Bytes {
  return msg("Z", [te.encode(status)]);
}

export function CommandComplete(tag: string): Bytes {
  return msg("C", [z(tag)]);
}

export function EmptyQueryResponse(): Bytes {
  return msg("I", []);
}

export function NoticeResponse(text: string): Bytes {
  return msg("N", [
    te.encode("S"),
    z("NOTICE"),
    te.encode("M"),
    z(text),
    new Uint8Array([0]),
  ]);
}

export function ErrorResponse(message: string, code = "XX000"): Bytes {
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

export function RowDescription(cols: ColumnSpec[]): Bytes {
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

export function DataRow(values: (string | Bytes | null)[]): Bytes {
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

export function ParseComplete(): Bytes {
  return msg("1", []);
}

export function BindComplete(): Bytes {
  return msg("2", []);
}

export function CloseComplete(): Bytes {
  return msg("3", []);
}

export function NoData(): Bytes {
  return msg("n", []);
}
