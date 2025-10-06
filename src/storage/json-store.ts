import type { DB, Table } from "../types/index.ts";
import { z } from "zod";

const DB_CACHE = new Map<string, DB>();

// Schema for validating JSON table data
const TableRowSchema = z.record(z.string(), z.unknown());
const TableSchema = z.array(TableRowSchema);

export async function loadDB(dbName: string): Promise<DB> {
  if (DB_CACHE.has(dbName)) return DB_CACHE.get(dbName)!;

  const fs = await import("node:fs/promises");
  const base = `./data/${dbName}`;
  let files: string[] = [];

  try {
    for await (const entry of await fs.opendir(base)) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(entry.name);
      }
    }
  } catch {
    // Database directory doesn't exist
    DB_CACHE.set(dbName, {});
    return {};
  }

  const db: DB = {};
  for (const f of files) {
    const table = f.replace(/\.json$/i, "");
    try {
      const txt = await fs.readFile(`${base}/${f}`, "utf8");
      const parsed: unknown = JSON.parse(txt);

      // Validate with Zod schema
      const validated = TableSchema.safeParse(parsed);
      if (validated.success) {
        db[table] = validated.data;
      } else {
        console.warn(`Invalid table data in ${f}: ${validated.error.message}`);
      }
    } catch (err) {
      console.warn(`Failed to load table ${f}:`, err);
    }
  }

  DB_CACHE.set(dbName, db);
  return db;
}

export function clearDBCache(): void {
  DB_CACHE.clear();
}
