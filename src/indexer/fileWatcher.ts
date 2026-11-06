import {
  readdir,
  readFile,
  stat
} from "node:fs/promises";

import path from "node:path";

import {
  watch,
  type FSWatcher
} from "chokidar";

import {
  IGNORED_DIRECTORIES,
  MAX_FILE_SIZE_BYTES,
  shouldIgnorePath
} from "../config/ignorePatterns";

import type {
  ProjectFile,
  TextChunk
} from "../types";

const CHUNK_SIZE_CHARS = 3200;
const CHUNK_OVERLAP_CHARS = 400;
const WATCH_DEBOUNCE_MS = 500;
const EMBEDDING_CONTEXT_LANGUAGES = new Set([
  "typescript",
  "javascript",
  "python"
]);

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".md": "markdown",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".sql": "sql",
  ".sh": "shell",
  ".ps1": "powershell",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".cs": "csharp"
};

function inferLanguage(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  return LANGUAGE_MAP[extension] ??
    (extension.slice(1) || "text");
}

async function readProjectFile(
  rootPath: string,
  fullPath: string
): Promise<ProjectFile | null> {
  const normalizedPath = path.normalize(fullPath);

  if (shouldIgnorePath(normalizedPath)) {
    return null;
  }

  const fileStats = await stat(normalizedPath);

  if (!fileStats.isFile()) {
    return null;
  }

  if (fileStats.size > MAX_FILE_SIZE_BYTES) {
    return null;
  }

  const content = await readFile(
    normalizedPath,
    "utf8"
  );

  const relativePath = path.normalize(
    path.relative(rootPath, normalizedPath)
  );

  return {
    path: relativePath,
    content,
    mtime: fileStats.mtime,
    size: fileStats.size,
    language: inferLanguage(normalizedPath)
  };
}

export async function scanProject(
  rootPath: string
): Promise<ProjectFile[]> {
  const normalizedRoot = path.resolve(
    path.normalize(rootPath)
  );

  const rootStats = await stat(normalizedRoot);

  if (!rootStats.isDirectory()) {
    throw new Error(
      `Project root is not a directory: ${normalizedRoot}`
    );
  }

  const discoveredFiles: ProjectFile[] = [];

  async function walkDirectory(
    currentDirectory: string
  ): Promise<void> {
    const entries = await readdir(
      currentDirectory,
      { withFileTypes: true }
    );

    for (const entry of entries) {
      const fullPath = path.join(
        currentDirectory,
        entry.name
      );

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (
          shouldIgnorePath(entry.name, true)
        ) {
          continue;
        }

        await walkDirectory(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (shouldIgnorePath(entry.name)) {
        continue;
      }

      const file = await readProjectFile(
        normalizedRoot,
        fullPath
      );

      if (file) {
        discoveredFiles.push(file);
      }
    }
  }

  await walkDirectory(normalizedRoot);

  discoveredFiles.sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  return discoveredFiles;
}

export async function countProjectFiles(
  rootPath: string,
  stopAfter: number = Number.POSITIVE_INFINITY
): Promise<number> {
  if (
    stopAfter !== Number.POSITIVE_INFINITY &&
    (!Number.isInteger(stopAfter) || stopAfter < 1)
  ) {
    throw new Error("countProjectFiles stopAfter must be a positive integer.");
  }

  const normalizedRoot = path.resolve(path.normalize(rootPath));
  const rootStats = await stat(normalizedRoot);

  if (!rootStats.isDirectory()) {
    throw new Error(`Project root is not a directory: ${normalizedRoot}`);
  }

  let count = 0;

  async function walkDirectory(currentDirectory: string): Promise<void> {
    if (count >= stopAfter) return;
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (count >= stopAfter) return;
      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (shouldIgnorePath(entry.name, true)) continue;
        await walkDirectory(fullPath);
        continue;
      }

      if (!entry.isFile() || shouldIgnorePath(entry.name)) continue;
      const fileStats = await stat(fullPath);
      if (fileStats.isFile() && fileStats.size <= MAX_FILE_SIZE_BYTES) count++;
    }
  }

  await walkDirectory(normalizedRoot);
  return count;
}

interface TextSegment {
  content: string;
  startOffset: number;
}

function findTextSegments(
  file: ProjectFile
): TextSegment[] {
  const content = file.content;

  if (!content.length) {
    return [];
  }

  let boundaryPattern: RegExp | null = null;

  if (file.language === "markdown") {
    boundaryPattern = /^#{1,6}\s+.+$/gm;
  } else if (
    ["typescript", "javascript", "python"].includes(
      file.language
    )
  ) {
    boundaryPattern =
      /^\s*(?:(?:export|default|declare|abstract|async|public|private|protected|static)\s+)*(?:function\s+\*?\w+|class\s+\w+|(?:const|let|var)\s+\w+\s*=.*(?:=>|function)|def\s+\w+)\b/gm;
  }

  if (!boundaryPattern) {
    return [{
      content,
      startOffset: 0
    }];
  }

  const boundaries = [0];

  for (
    const match of content.matchAll(boundaryPattern)
  ) {
    if (
      match.index !== undefined &&
      match.index > 0
    ) {
      boundaries.push(match.index);
    }
  }

  const uniqueBoundaries = [
    ...new Set(boundaries)
  ].sort((a, b) => a - b);

  const segments: TextSegment[] = [];

  for (
    let index = 0;
    index < uniqueBoundaries.length;
    index++
  ) {
    const start = uniqueBoundaries[index];

    const end =
      uniqueBoundaries[index + 1] ??
      content.length;

    const section = content.slice(start, end);

    if (section.trim().length > 0) {
      segments.push({
        content: section,
        startOffset: start
      });
    }
  }

  return segments;
}

function createLineLookup(content: string) {
  const lineStarts = [0];

  for (
    let index = 0;
    index < content.length;
    index++
  ) {
    if (content[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
      const middle = Math.floor(
        (low + high) / 2
      );

      if (lineStarts[middle] <= offset) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return high + 1;
  };
}

export function chunkFile(
  file: ProjectFile
): TextChunk[] {
  const chunks: TextChunk[] = [];

  if (!file.content.length) {
    return chunks;
  }

  const getLineNumber = createLineLookup(
    file.content
  );

  const segments = findTextSegments(file);

  for (const segment of segments) {
    let offset = 0;

    while (offset < segment.content.length) {
      const end = Math.min(
        offset + CHUNK_SIZE_CHARS,
        segment.content.length
      );

      const absoluteStart =
        segment.startOffset + offset;

      const absoluteEnd =
        segment.startOffset + end;

      const chunkContent = segment.content.slice(
        offset,
        end
      );

      chunks.push({
        filePath: file.path,
        content: chunkContent,
        ...(EMBEDDING_CONTEXT_LANGUAGES.has(file.language)
          ? {
              embeddingText:
                `File: ${file.path} | Language: ${file.language}\n` +
                chunkContent
            }
          : {}),
        startLine: getLineNumber(absoluteStart),
        endLine: getLineNumber(
          Math.max(absoluteStart, absoluteEnd - 1)
        ),
        chunkIndex: chunks.length
      });

      if (end >= segment.content.length) {
        break;
      }

      offset = end - CHUNK_OVERLAP_CHARS;
    }
  }

  return chunks;
}

function shouldIgnoreWatchedPath(
  rootPath: string,
  candidatePath: string,
  isDirectory?: boolean
): boolean {
  const relativePath = path.relative(
    rootPath,
    path.normalize(candidatePath)
  );

  if (!relativePath) {
    return false;
  }

  const segments = relativePath.split(path.sep);

  return segments.some((segment, index) => {
    const isIntermediate =
      index < segments.length - 1;

    if (
      isIntermediate ||
      (index === segments.length - 1 && isDirectory)
    ) {
      return IGNORED_DIRECTORIES.has(
        segment.toLowerCase()
      );
    }

    return shouldIgnorePath(segment);
  });
}

export function watchProject(
  rootPath: string,
  onChange: (file: ProjectFile) => void
): FSWatcher {
  const normalizedRoot = path.resolve(
    path.normalize(rootPath)
  );

  const timers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  const watcher = watch(normalizedRoot, {
    ignoreInitial: true,

    ignored: (candidatePath, stats) =>
      shouldIgnoreWatchedPath(
        normalizedRoot,
        candidatePath,
        stats?.isDirectory()
      )
  });

  const scheduleChange = (
    fullPath: string
  ): void => {
    const normalizedPath = path.normalize(fullPath);

    const existingTimer = timers.get(normalizedPath);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      timers.delete(normalizedPath);

      void readProjectFile(
        normalizedRoot,
        normalizedPath
      )
        .then((file) => {
          if (file) {
            onChange(file);
          }
        })
        .catch((error: unknown) => {
          console.error(
            "[ContextVault] File watcher error:",
            error
          );
        });
    }, WATCH_DEBOUNCE_MS);

    timers.set(normalizedPath, timer);
  };

  watcher
    .on("add", scheduleChange)
    .on("change", scheduleChange);

  watcher.on("close", () => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }

    timers.clear();
  });

  return watcher;
}
