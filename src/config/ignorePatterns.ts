import path from "node:path";

export const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  "__pycache__"
]);

export const IGNORED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".7z",
  ".rar",
  ".tar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".class",
  ".jar",
  ".wasm",
  ".pyc",
  ".pyo"
]);

export const MAX_FILE_SIZE_BYTES = 1024 * 1024;

export const shouldIgnorePath = (
  entryPath: string,
  isDirectory = false
): boolean => {
  const name = path.basename(entryPath).toLowerCase();

  if (isDirectory) {
    return IGNORED_DIRECTORIES.has(name);
  }

  const extension = path.extname(name).toLowerCase();

  if (IGNORED_EXTENSIONS.has(extension)) {
    return true;
  }

  return name.endsWith(".lock") || name.endsWith(".log");
};
