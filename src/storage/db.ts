import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { mkdirSync } from "node:fs";

const configuredPath =
  process.env.DATABASE_PATH ??
  path.join(process.cwd(), "data", "contextvault.db");

const databasePath =
  configuredPath === ":memory:"
    ? ":memory:"
    : path.resolve(configuredPath);

export const resolvedDatabasePath = databasePath;

if (databasePath !== ":memory:") {
  mkdirSync(path.dirname(databasePath), {
    recursive: true
  });
}

export const database = new DatabaseSync(databasePath);

database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA foreign_keys = ON;");

database.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    mtime TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size >= 0),
    language TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    start_line INTEGER NOT NULL CHECK (start_line >= 1),
    end_line INTEGER NOT NULL CHECK (end_line >= start_line),
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    UNIQUE (file_id, chunk_index)
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

database.prepare(`
  INSERT OR IGNORE INTO settings (key, value)
  VALUES (?, ?)
`).run("license", "Free");

interface CountRow {
  total: number | bigint;
}

interface SettingRow {
  value: string;
}

export type LicenseType = "Free" | "Pro";

export function getLicense(): LicenseType {
  const row = database.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
  `).get("license") as SettingRow | undefined;

  return row?.value === "Pro" ? "Pro" : "Free";
}

export function setLicense(license: LicenseType): LicenseType {
  database.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value
  `).run("license", license);

  return license;
}

export function getSystemStats(): {
  totalFiles: number;
  totalChunks: number;
} {
  const filesRow = database.prepare(`
    SELECT COUNT(*) AS total
    FROM files
  `).get() as CountRow | undefined;

  const chunksRow = database.prepare(`
    SELECT COUNT(*) AS total
    FROM chunks
  `).get() as CountRow | undefined;

  return {
    totalFiles: Number(filesRow?.total ?? 0),
    totalChunks: Number(chunksRow?.total ?? 0)
  };
}

export default database;
