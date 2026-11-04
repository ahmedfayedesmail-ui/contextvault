import { Router } from "express";

import { stat } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { scanProject } from "../indexer/fileWatcher";

import type { ScannedFile } from "../types";

export const apiRouter = Router();

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
      error: "Project scan failed"
    });
  }
});
