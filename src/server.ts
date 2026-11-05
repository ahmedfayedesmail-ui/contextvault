import "dotenv/config";

import express from "express";

import { apiRouter } from "./api/routes";

import { warmupEmbeddingModel } from "./indexer/embedder";

import "./storage/db";

import type { HealthResponse } from "./types";

const app = express();

const PORT = Number(process.env.PORT ?? 3737);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("Invalid PORT configuration.");
}

app.use(express.json());

app.get("/health", (_req, res) => {
  const response: HealthResponse = {
    status: "ok",
    version: "0.1.0"
  };

  res.json(response);
});

// Serve the ContextVault frontend.

app.use(express.static("public"));

app.use("/api", apiRouter);

export { app };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `ContextVault running on http://localhost:${PORT}`
    );

    // Warm the local embedding model in the background. This keeps startup
    // responsive while avoiding the model-load penalty on the first search.
    void warmupEmbeddingModel();
  });
}
