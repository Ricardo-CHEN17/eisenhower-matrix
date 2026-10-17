import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DB_PATH } from "../config";
import { migrate } from "./migrate";
import * as schema from "./schema";

export type AppDb = BetterSQLite3Database<typeof schema>;

export interface DbContext {
  sqlite: Database.Database;
  db: AppDb;
}

export function createDb(databasePath: string = DB_PATH): DbContext {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  migrate(sqlite);
  const db = drizzle(sqlite, { schema });

  return { sqlite, db };
}
