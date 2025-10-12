import type { DB } from "../types/index.ts";
import { z } from "zod";
import { Glob } from "bun";
import { logger } from "../utils/logger.ts";
import { mkdir, stat, readdir } from "node:fs/promises";

// Schema for validating JSON table data
const TableRowSchema = z.record(z.string(), z.unknown());
const TableSchema = z.array(TableRowSchema);

// Ensure the database and public schema directory exists
async function ensureDefaultStructure(dbName: string): Promise<void> {
  const publicPath = `./data/${dbName}/public`;
  try {
    await mkdir(publicPath, { recursive: true });
    logger.debug(
      { path: publicPath },
      "Ensured database and public schema exist",
    );
  } catch (err) {
    // Ignore if directory already exists
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      logger.warn({ err }, "Failed to create default structure");
    }
  }
}

export async function loadDB(dbName: string): Promise<DB> {
  // Ensure database and public schema exist
  await ensureDefaultStructure(dbName);

  const base = `./data/${dbName}`;
  const db: DB = {};

  try {
    // Find all schema directories in ./data/<database>/
    const entries = await readdir(base);

    for (const schemaName of entries) {
      const schemaPath = `${base}/${schemaName}`;

      // Check if it's a directory
      try {
        const statInfo = await stat(schemaPath);
        if (!statInfo.isDirectory()) {
          logger.debug({ path: schemaPath }, "Skipping non-directory entry");
          continue;
        }
      } catch (err) {
        logger.debug({ path: schemaPath, err }, "Failed to stat entry");
        continue;
      }

      // Load all JSON files in this schema directory
      const tableGlob = new Glob("*.json");
      let files: string[] = [];
      try {
        files = Array.from(tableGlob.scanSync(schemaPath));
      } catch {
        // Schema directory doesn't exist or can't be read
        continue;
      }

      if (files.length === 0) {
        // Schema exists but has no tables
        db[schemaName] = {};
        continue;
      }

      db[schemaName] = {};

      for (const f of files) {
        const tableName = f.replace(/\.json$/i, "");
        try {
          // Use Bun.file() API for reading files
          const file = Bun.file(`${schemaPath}/${f}`);
          const txt = await file.text();
          const parsed: unknown = JSON.parse(txt);

          // Validate with Zod schema
          const validated = TableSchema.safeParse(parsed);
          if (validated.success) {
            db[schemaName]![tableName] = validated.data;
            logger.debug(
              {
                schema: schemaName,
                table: tableName,
                rows: validated.data.length,
              },
              "Loaded table",
            );
          } else {
            logger.warn(
              { schema: schemaName, file: f, error: validated.error.message },
              "Invalid table data",
            );
          }
        } catch (err) {
          logger.warn(
            { schema: schemaName, file: f, err },
            "Failed to load table",
          );
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load schemas");
    // Return at least an empty public schema
    return { public: {} };
  }

  // Ensure public schema exists in the result even if empty
  if (!db.public) {
    db.public = {};
  }

  return db;
}
