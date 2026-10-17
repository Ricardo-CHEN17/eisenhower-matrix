import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(currentDir, "..");
export const ROOT = path.resolve(SERVER_ROOT, "../..");
export const MIGRATIONS_DIR = path.join(SERVER_ROOT, "migrations");
export const WEB_DIST = path.join(ROOT, "apps", "web", "dist");
export const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(ROOT, "data", "app.db");
export const BACKUP_DIR = path.join(ROOT, "backups");
export const PORT = Number(process.env.PORT || 3001);
