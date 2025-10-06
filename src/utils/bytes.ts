import type { Bytes } from "../types/index.ts";

const te = new TextEncoder();
const td = new TextDecoder();

export function be16(n: number): Bytes {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setInt16(0, n, false);
  return b;
}

export function be32(n: number): Bytes {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n, false);
  return b;
}

export function concat(parts: Bytes[]): Bytes {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function z(s = ""): Bytes {
  return new Uint8Array([...te.encode(s), 0]);
}

export function msg(type: string, payload: Bytes[]): Bytes {
  const body = concat(payload);
  return concat([te.encode(type), be32(body.length + 4), body]);
}

export function readCString(
  buf: Uint8Array,
  offset: number,
): { s: string; next: number } {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const s = td.decode(buf.subarray(offset, end));
  return { s, next: end + 1 };
}

export function appendBuffer(oldB: Uint8Array, inc: Uint8Array): Uint8Array {
  const out = new Uint8Array(oldB.length + inc.length);
  out.set(oldB, 0);
  out.set(inc, oldB.length);
  return out;
}

export { te, td };
