import { Router } from "express";

import { stat } from "node:fs/promises";

import path from "node:path";

import { z } from "zod";

import { scanProject } from "../indexer/fileWatcher";

import { indexProject } from "../indexer/pipeline";

import { startLiveWatcher } from "../indexer/liveWatcher";

import { generateEmbedding } from "../indexer/embedder";

import { searchVectors } from "../storage/vectors";

import { getSystemStats } from "../storage/db";

import type { ScannedFile } from "../types";

export const apiRouter = Router();

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

apiRouter.post("/index", async (req, res) => {
  const validation =
    await scanRequestSchema.safeParseAsync(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid indexing request",
      details: validation.error.issues
    });
  }

  try {
    const rootPath = path.resolve(
      validation.data.rootPath
    );

    const result = await indexProject(rootPath);

    return res.json({
      success: true,
      filesCount: result.filesCount,
      chunksCount: result.chunksCount
    });

  } catch (error) {
    console.error(
      "[ContextVault] Project indexing failed:",
      error
    );

    return res.status(500).json({
      error: "Project indexing failed",
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

    startLiveWatcher(rootPath);

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
