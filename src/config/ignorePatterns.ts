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
  ".pyo",
  ".map",
  ".json",
  ".xml",
  ".log",
  ".csv",
  ".yaml",
  ".yml"
]);

const IGNORED_FILE_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml"
]);

const IGNORED_FILE_SUFFIXES = [
  ".lock",
  ".log",
  ".min.js"
];

export const MAX_FILE_SIZE_BYTES = 500 * 1024;

export const shouldIgnorePath = (
  entryPath: string,
  isDirectory = false
): boolean => {
  const name = path.basename(entryPath).toLowerCase();

  if (isDirectory) {
    return IGNORED_DIRECTORIES.has(name);
  }

  if (IGNORED_FILE_NAMES.has(name)) {
    return true;
  }

  if (IGNORED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    return true;
  }

  const extension = path.extname(name).toLowerCase();

  return IGNORED_EXTENSIONS.has(extension);
};
