import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";

import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";

let app!: Express;
let database!: DatabaseSync;
let resolvedDatabasePath!: string;
let temporaryDirectory = "";

const originalDatabasePath = process.env.DATABASE_PATH;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "contextvault-settings-")
  );

  process.env.DATABASE_PATH = path.join(
    temporaryDirectory,
    "contextvault-test.db"
  );

  const dbModule = await import("../src/storage/db");
  const serverModule = await import("../src/server");

  database = dbModule.database;
  resolvedDatabasePath = dbModule.resolvedDatabasePath;
  app = serverModule.app;
});

afterAll(async () => {
  database.close();

  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = originalDatabasePath;
  }

  if (temporaryDirectory) {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true
    });
  }
});

describe("ContextVault settings", () => {
  it("defaults the license selection to Free", async () => {
    const response = await request(app)
      .get("/api/settings/license");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      license: "Free",
      verified: false
    });
  });

  it("does not allow Pro to be enabled without license validation", async () => {
    const updateResponse = await request(app)
      .put("/api/settings/license")
      .send({ license: "Pro" });

    expect(updateResponse.status).toBe(403);

    const readResponse = await request(app)
      .get("/api/settings/license");

    expect(readResponse.status).toBe(200);
    expect(readResponse.body).toEqual({
      license: "Free",
      verified: false
    });
  });

  it("allows the local license state to be reset to Free", async () => {
    const response = await request(app)
      .put("/api/settings/license")
      .send({ license: "Free" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      license: "Free",
      verified: false
    });
  });

  it("rejects invalid license values", async () => {
    const response = await request(app)
      .put("/api/settings/license")
      .send({ license: "Enterprise" });

    expect(response.status).toBe(400);
  });

  it("returns the machine-specific MCP configuration", async () => {
    const response = await request(app)
      .get("/api/config/mcp");

    expect(response.status).toBe(200);

    const server =
      response.body.mcpServers.contextvault;

    expect(server).toBeDefined();
    expect(server.command).toBe(process.execPath);
    expect(server.env.DATABASE_PATH).toBe(resolvedDatabasePath);
    expect(server.env.OLLAMA_URL).toBe(
      process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"
    );
    expect(server.env.NODE_OPTIONS).toContain(
      "--experimental-sqlite"
    );
    expect(Array.isArray(server.args)).toBe(true);

    expect(
      server.args.some((argument: string) =>
        argument.endsWith(path.join("src", "mcp-entry.ts"))
      ) ||
      server.args.some((argument: string) =>
        argument.endsWith(path.join("dist", "mcp-entry.js"))
      )
    ).toBe(true);
  });
});
