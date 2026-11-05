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
    path TEXT NOT NULL,
    root_path TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    mtime TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size >= 0),
    language TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (root_path, path)
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

// Older databases did not store the owning project root. Add it without
// discarding data, then migrate the former path-only uniqueness rule to a
// project-scoped key so two projects can both contain (for example) src/index.ts.
const fileColumns = database.prepare("PRAGMA table_info(files)").all() as Array<{ name: string }>;
if (!fileColumns.some((column) => column.name === "root_path")) {
  database.exec("ALTER TABLE files ADD COLUMN root_path TEXT NOT NULL DEFAULT ''");
}

interface FileIndexRow {
  name: string;
  unique: number;
}

interface FileIndexColumnRow {
  name: string | null;
}

const fileIndexes = database.prepare("PRAGMA index_list(files)").all() as FileIndexRow[];
const hasProjectScopedUniqueIndex = fileIndexes.some((index) => {
  if (Number(index.unique) !== 1) {
    return false;
  }

  const escapedIndexName = index.name.replace(/"/g, '""');
  const columns = database.prepare(
    `PRAGMA index_info("${escapedIndexName}")`
  ).all() as FileIndexColumnRow[];

  return columns.map((column) => column.name).join(",") === "root_path,path";
});

if (!hasProjectScopedUniqueIndex) {
  // The chunks table retains file IDs. Foreign keys are disabled only for this
  // bounded table rebuild, IDs are copied verbatim, then enforcement is restored.
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec(`
      CREATE TABLE files_project_scoped (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        root_path TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        mtime TEXT NOT NULL,
        size INTEGER NOT NULL CHECK (size >= 0),
        language TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (root_path, path)
      );

      INSERT INTO files_project_scoped (
        id, path, root_path, content, mtime, size, language, created_at, updated_at
      )
      SELECT
        id, path, root_path, content, mtime, size, language, created_at, updated_at
      FROM files;

      DROP TABLE files;
      ALTER TABLE files_project_scoped RENAME TO files;
      CREATE INDEX IF NOT EXISTS idx_files_root_path ON files(root_path);
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

database.exec("CREATE INDEX IF NOT EXISTS idx_files_root_path ON files(root_path)");

database.prepare(`
  INSERT OR IGNORE INTO settings (key, value)
  VALUES (?, ?)
`).run("license", "Free");

database.prepare(`
  INSERT OR IGNORE INTO settings (key, value)
  VALUES (?, ?)
`).run("license_verified", "false");

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

  const verification = database.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
  `).get("license_verified") as SettingRow | undefined;

  return row?.value === "Pro" && verification?.value === "true"
    ? "Pro"
    : "Free";
}

export function setLicense(license: LicenseType): LicenseType {
  database.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value
  `).run("license", license);

  // A locally written plan value is never sufficient to grant Pro.
  database.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value
  `).run("license_verified", "false");

  return license;
}

export async function validateLicenseKey(key: string): Promise<boolean> {
  const normalizedKey = key.trim();

  if (!normalizedKey) {
    return false;
  }

  try {
    const response = await fetch(
      "https://api.lemonsqueezy.com/v1/licenses/validate",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          license_key: normalizedKey
        }).toString()
      }
    );

    if (!response.ok) {
      return false;
    }

    const result = await response.json() as {
      valid?: boolean;
    };

    if (result.valid !== true) {
      return false;
    }

    setLicense("Pro");

    database.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value
    `).run("license_verified", "true");

    return true;
  } catch {
    return false;
  }
}

export function getSystemStats(): {
  totalFiles: number;
  totalChunks: number;
} {
  const filesRow = database.prepare(`
    SELECT COUNT(*) AS total
    FROM files
    WHERE root_path <> ''
  `).get() as CountRow | undefined;

  const chunksRow = database.prepare(`
    SELECT COUNT(*) AS total
    FROM chunks
    INNER JOIN files ON files.id = chunks.file_id
    WHERE files.root_path <> ''
  `).get() as CountRow | undefined;

  return {
    totalFiles: Number(filesRow?.total ?? 0),
    totalChunks: Number(chunksRow?.total ?? 0)
  };
}

export default database;
