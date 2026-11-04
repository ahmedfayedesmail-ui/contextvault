import { Router } from "express";

import { existsSync } from "node:fs";

import { randomUUID } from "node:crypto";

import { stat } from "node:fs/promises";

import path from "node:path";

import { z } from "zod";

import { scanProject } from "../indexer/fileWatcher";

import { indexProject } from "../indexer/pipeline";

import { startLiveWatcher, stopLiveWatcher } from "../indexer/liveWatcher";

import { generateEmbedding } from "../indexer/embedder";

import { clearIndexedData, searchVectors } from "../storage/vectors";

import {
  getSystemStats,
  getLicense,
  setLicense,
  resolvedDatabasePath
} from "../storage/db";

import type { ScannedFile } from "../types";

export const apiRouter = Router();

function buildMcpConfiguration() {
  // src/api in development and dist/api in production both resolve
  // two levels up to the ContextVault project root.
  const projectRoot = path.resolve(__dirname, "../..");

  const sourceEntry = path.join(projectRoot, "src", "mcp-entry.ts");
  const tsxCliPath = path.join(
    projectRoot,
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs"
  );
  const compiledEntry = path.join(projectRoot, "dist", "mcp-entry.js");

  let args: string[];

  if (existsSync(sourceEntry) && existsSync(tsxCliPath)) {
    args = [tsxCliPath, sourceEntry];
  } else if (existsSync(compiledEntry)) {
    args = [compiledEntry];
  } else {
    throw new Error(
      "ContextVault MCP launch files were not found. " +
      "Install dependencies or build the application."
    );
  }

  const configuredNodeOptions = process.env.NODE_OPTIONS ?? "";
  const nodeOptions = configuredNodeOptions.includes("--experimental-sqlite")
    ? configuredNodeOptions
    : [configuredNodeOptions, "--experimental-sqlite"]
        .filter(Boolean)
        .join(" ");

  return {
    mcpServers: {
      contextvault: {
        command: process.execPath,
        args,
        env: {
          DATABASE_PATH: resolvedDatabasePath,
          OLLAMA_URL: process.env.OLLAMA_URL ?? "http://localhost:11434",
          NODE_OPTIONS: nodeOptions
        }
      }
    }
  };
}


// GET /api/stats

apiRouter.get("/stats", (_req, res) => {
  try {
    return res.json(getSystemStats());
  } catch (error) {
    console.error(
      "[ContextVault] Stats retrieval failed:",
      error
    );

    return res.status(500).json({
      error: "Stats retrieval failed",
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
    });
  }
});


// GET /api/config/mcp

apiRouter.get("/config/mcp", (_req, res) => {
  try {
    if (resolvedDatabasePath === ":memory:") {
      return res.status(409).json({
        error: "MCP requires a persistent database.",
        message:
          "Set DATABASE_PATH to a local SQLite file before connecting MCP."
      });
    }

    return res.json(buildMcpConfiguration());
  } catch (error) {
    console.error(
      "[ContextVault] MCP configuration generation failed:",
      error
    );

    return res.status(500).json({
      error: "MCP configuration generation failed",
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
    });
  }
});

const licenseRequestSchema = z.object({
  license: z.enum(["Free", "Pro"])
});

// GET /api/settings/license

apiRouter.get("/settings/license", (_req, res) => {
  try {
    return res.json({
      license: getLicense(),
      verified: false
    });
  } catch (error) {
    console.error(
      "[ContextVault] License settings retrieval failed:",
      error
    );

    return res.status(500).json({
      error: "Unable to retrieve license settings."
    });
  }
});

// PUT /api/settings/license

apiRouter.put("/settings/license", (req, res) => {
  const validation = licenseRequestSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid license selection.",
      details: validation.error.issues
    });
  }

  try {
    const license = setLicense(validation.data.license);

    return res.json({
      success: true,
      license,
      verified: false,
      message:
        "This is a local display selection only. " +
        "It does not activate paid features."
    });
  } catch (error) {
    console.error(
      "[ContextVault] License settings update failed:",
      error
    );

    return res.status(500).json({
      error: "Unable to update license settings."
    });
  }
});

const scanRequestSchema = z.object({
  rootPath: z.string()
    .trim()
    .min(1)
    .refine(
      async (rootPath) => {
        try {
          const stats = await stat(
            path.resolve(rootPath)
          );

          return stats.isDirectory();

        } catch {
          return false;
        }
      },
      {
        message: "rootPath must be an existing directory"
      }
    )
});

type IndexJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

type IndexJobStage =
  | "scanning"
  | "embedding"
  | "completed"
  | "failed";

interface IndexJob {
  jobId: string;
  status: IndexJobStatus;
  stage: IndexJobStage;
  totalFiles: number;
  completedFiles: number;
  totalChunks: number;
  completedChunks: number;
  currentFile: string | null;
  filesCount: number | null;
  chunksCount: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const indexJobs = new Map<string, IndexJob>();
let activeIndexJobId: string | null = null;

const INDEX_JOB_RETENTION_MS = 30 * 60 * 1000;

function cleanupFinishedIndexJobs(): void {
  const cutoff = Date.now() - INDEX_JOB_RETENTION_MS;

  for (const [jobId, job] of indexJobs.entries()) {
    const finished =
      job.status === "completed" || job.status === "failed";

    if (finished && job.updatedAt < cutoff) {
      indexJobs.delete(jobId);
    }
  }
}

const searchRequestSchema = z.object({
  query: z.string()
    .trim()
    .min(1),

  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .optional()
});

// POST /api/scan

apiRouter.post("/scan", async (req, res) => {
  const validation =
    await scanRequestSchema.safeParseAsync(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid scan request",
      details: validation.error.issues
    });
  }

  try {
    const rootPath = path.resolve(
      validation.data.rootPath
    );

    const files = await scanProject(rootPath);

    const scannedFiles: ScannedFile[] =
      files.map((file) => ({
        path: file.path,
        mtime: file.mtime,
        size: file.size,
        language: file.language
      }));

    console.info(
      `[ContextVault] Scan completed: ${files.length} files`
    );

    return res.json({
      scanned: files.length,
      files: scannedFiles
    });

  } catch (error) {
    console.error(
      "[ContextVault] Project scan failed:",
      error
    );

    return res.status(500).json({
      error: "Project scan failed",
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
    });
  }
});

// POST /api/index
// Start indexing in the background and return a job ID immediately.

apiRouter.post("/index", async (req, res) => {
  const validation =
    await scanRequestSchema.safeParseAsync(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid indexing request",
      details: validation.error.issues
    });
  }

  cleanupFinishedIndexJobs();

  if (activeIndexJobId) {
    const activeJob = indexJobs.get(activeIndexJobId);

    if (
      activeJob &&
      (activeJob.status === "queued" || activeJob.status === "running")
    ) {
      return res.status(409).json({
        error: "Indexing is already in progress.",
        jobId: activeJob.jobId
      });
    }

    activeIndexJobId = null;
  }

  const rootPath = path.resolve(validation.data.rootPath);
  const now = Date.now();

  const job: IndexJob = {
    jobId: randomUUID(),
    status: "queued",
    stage: "scanning",
    totalFiles: 0,
    completedFiles: 0,
    totalChunks: 0,
    completedChunks: 0,
    currentFile: null,
    filesCount: null,
    chunksCount: null,
    error: null,
    createdAt: now,
    updatedAt: now
  };

  indexJobs.set(job.jobId, job);
  activeIndexJobId = job.jobId;

  // This task is intentionally not awaited by the HTTP request.
  void (async () => {
    job.status = "running";
    job.updatedAt = Date.now();

    try {
      const result = await indexProject(rootPath, (progress) => {
        job.stage = progress.stage;
        job.totalFiles = progress.totalFiles;
        job.completedFiles = progress.completedFiles;
        job.totalChunks = progress.totalChunks;
        job.completedChunks = progress.completedChunks;
        job.currentFile = progress.currentFile;
        job.updatedAt = Date.now();
      });

      job.status = "completed";
      job.stage = "completed";
      job.filesCount = result.filesCount;
      job.chunksCount = result.chunksCount;
    } catch (error) {
      job.status = "failed";
      job.stage = "failed";
      job.error =
        error instanceof Error
          ? error.message
          : "An unexpected indexing error occurred.";

      console.error(
        `[ContextVault] Index job ${job.jobId} failed:`,
        error
      );
    } finally {
      job.updatedAt = Date.now();

      if (activeIndexJobId === job.jobId) {
        activeIndexJobId = null;
      }
    }
  })();

  return res.status(202).json({
    success: true,
    job: { ...job }
  });
});

// GET /api/index/:jobId
// Retrieve the latest progress for a background indexing job.

apiRouter.get("/index/:jobId", (req, res) => {
  const job = indexJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      error: "Index job not found."
    });
  }

  return res.json({
    job: { ...job }
  });
});

// DELETE /api/index
// Stop live file updates before clearing all indexed data.

apiRouter.delete("/index", async (_req, res) => {
  if (activeIndexJobId) {
    const activeJob = indexJobs.get(activeIndexJobId);

    if (
      activeJob &&
      (activeJob.status === "queued" || activeJob.status === "running")
    ) {
      return res.status(409).json({
        error: "Cannot clear the index while indexing is in progress."
      });
    }
  }

  try {
    await stopLiveWatcher();

    const result = clearIndexedData();

    return res.json({
      success: true,
      ...result,
      stats: getSystemStats()
    });
  } catch (error) {
    console.error(
      "[ContextVault] Clear index failed:",
      error
    );

    return res.status(500).json({
      error: "Clear index failed",
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
    });
  }
});

// POST /api/watch

apiRouter.post("/watch", async (req, res) => {
  const validation =
    await scanRequestSchema.safeParseAsync(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid watch request",
      details: validation.error.issues
    });
  }

  try {
    const rootPath = path.resolve(
      validation.data.rootPath
    );

    await startLiveWatcher(rootPath);

    return res.json({
      success: true,
      message: "Live project watcher started.",
      rootPath
    });
  } catch (error) {
    console.error(
      "[ContextVault] Live watcher startup failed:",
      error
    );

    return res.status(500).json({
      error: "Live watcher startup failed",
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
    });
  }
});

// POST /api/search

apiRouter.post("/search", async (req, res) => {
  const validation = searchRequestSchema.safeParse(
    req.body
  );

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid search request",
      details: validation.error.issues
    });
  }

  try {
    const { query, limit } = validation.data;

    // Convert the search query into an embedding.

    const queryEmbedding = await generateEmbedding(
      query
    );

    // Find the closest stored vectors.

    const results = searchVectors(
      queryEmbedding,
      limit ?? 5
    );

    return res.json({
      results
    });

  } catch (error) {
    console.error(
      "[ContextVault] Search failed:",
      error
    );

    return res.status(500).json({
      error: "Search failed",
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
    });
  }
});
