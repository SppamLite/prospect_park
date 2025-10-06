import type { SelectQuery } from "../types/index.ts";

function parseLiteral(lit: string): string | number | boolean | null {
  const s = lit.trim();
  if (/^null$/i.test(s)) return null;
  if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^'(.*)'$/s);
  if (m && m[1] !== undefined) return m[1].replace(/''/g, "'");
  return s; // bare word -> string
}

export function parseSelect(sqlRaw: string): SelectQuery | null {
  const sql = sqlRaw.trim().replace(/;$/, "");

  // Check for COUNT(*) query
  const countRe =
    /^select\s+count\(\s*\*\s*\)\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^ ]+))?\s*(?:limit\s+(\d+))?$/i;
  let m = sql.match(countRe);
  if (m) {
    const table = m[1];
    const wcol = m[2];
    const wval = m[3];
    const lim = m[4];
    if (!table) return null;
    const q: SelectQuery = { columns: "*", table, isCountStar: true };
    if (wcol && wval)
      q.where = { col: wcol, op: "=", value: parseLiteral(wval) };
    if (lim) q.limit = Number(lim);
    return q;
  }

  // Regular SELECT query
  const re =
    /^select\s+(.+)\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^ ]+))?\s*(?:limit\s+(\d+))?$/i;
  m = sql.match(re);
  if (!m) return null;

  const cols = m[1];
  const table = m[2];
  const wcol2 = m[3];
  const wval2 = m[4];
  const lim2 = m[5];

  if (!cols || !table) return null;

  const columns =
    cols.trim() === "*" ? "*" : cols.split(",").map((s) => s.trim());
  const q: SelectQuery = { columns, table };
  if (wcol2 && wval2)
    q.where = { col: wcol2, op: "=", value: parseLiteral(wval2) };
  if (lim2) q.limit = Number(lim2);
  return q;
}
