import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { DatabaseSync } from "node:sqlite";

let database!: DatabaseSync;
let getLicense!: () => "Free" | "Pro";
let setLicense!: (license: "Free" | "Pro") => "Free" | "Pro";
let validateLicenseKey!: (key: string) => Promise<boolean>;
let temporaryDirectory = "";

const originalDatabasePath = process.env.DATABASE_PATH;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "contextvault-license-")
  );

  process.env.DATABASE_PATH = path.join(
    temporaryDirectory,
    "contextvault-license-test.db"
  );

  const dbModule = await import("../src/storage/db");

  database = dbModule.database;
  getLicense = dbModule.getLicense;
  setLicense = dbModule.setLicense;
  validateLicenseKey = dbModule.validateLicenseKey;
});

beforeEach(() => {
  setLicense("Free");
  vi.stubGlobal("fetch", vi.fn());
});

afterAll(async () => {
  vi.unstubAllGlobals();

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

describe("Lemon Squeezy license validation", () => {
  it("activates Pro and persists the license when the key is valid", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, error: null })
    } as Response);

    const result = await validateLicenseKey("valid-license-key");

    expect(result).toBe(true);
    expect(getLicense()).toBe("Pro");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lemonsqueezy.com/v1/licenses/validate",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "license_key=valid-license-key"
      })
    );
  });

  it("does not trust a Pro value saved without verification", () => {
    setLicense("Pro");

    expect(getLicense()).toBe("Free");
  });

  it("returns false and keeps Free when the key is invalid", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: false,
        error: "License key is invalid."
      })
    } as Response);

    const result = await validateLicenseKey("invalid-license-key");

    expect(result).toBe(false);
    expect(getLicense()).toBe("Free");
  });
});
