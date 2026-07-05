import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

function createDb() {
  const dbPath =
    process.env.DAYSPRING_DB_PATH ??
    path.join(process.cwd(), "data", "dayspring.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// Cache on globalThis so Next dev HMR doesn't stack up connections.
const globalForDb = globalThis as unknown as {
  dayspringDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.dayspringDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.dayspringDb = db;
}
