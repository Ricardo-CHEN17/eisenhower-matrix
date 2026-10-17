import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { BACKUP_DIR, DB_PATH } from "./config";

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database found at ${DB_PATH}. Start the app once first.`);
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(BACKUP_DIR, `app-${stamp}.db`);
const sqlite = new Database(DB_PATH);

await sqlite.backup(destination);
sqlite.close();

console.log(destination);
