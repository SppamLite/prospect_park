import type { DB } from "../types/index.ts";
import { z } from "zod";
import { Glob } from "bun";
import { logger } from "../utils/logger.ts";

// Schema for validating JSON table data
const TableRowSchema = z.record(z.string(), z.unknown());
const TableSchema = z.array(TableRowSchema);

export async function loadDB(dbName: string): Promise<DB> {
  const base = `./data/${dbName}`;
  const db: DB = {};

  try {
    // Use Bun's Glob API to find all JSON files
    const glob = new Glob("*.json");
    const files = Array.from(glob.scanSync(base));

    if (files.length === 0) {
      // Database directory exists but is empty
      return {};
    }

    for (const f of files) {
      const table = f.replace(/\.json$/i, "");
      try {
        // Use Bun.file() API for reading files
        const file = Bun.file(`${base}/${f}`);
        const txt = await file.text();
        const parsed: unknown = JSON.parse(txt);

        // Validate with Zod schema
        const validated = TableSchema.safeParse(parsed);
        if (validated.success) {
          db[table] = validated.data;
          logger.debug(
            { database: dbName, table, rows: validated.data.length },
            "Loaded table",
          );
        } else {
          logger.warn(
            { file: f, error: validated.error.message },
            "Invalid table data",
          );
        }
      } catch (err) {
        logger.warn({ file: f, err }, "Failed to load table");
      }
    }
  } catch {
    // Database directory doesn't exist
    return {};
  }

  return db;
}
