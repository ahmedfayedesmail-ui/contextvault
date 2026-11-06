import {
  mkdtemp,
  mkdir,
  writeFile,
  rm
} from "node:fs/promises";

import path from "node:path";

import {
  tmpdir
} from "node:os";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import {
  scanProject,
  chunkFile
} from "../src/indexer/fileWatcher";

import type {
  ProjectFile
} from "../src/types";

describe("Project Scanner", () => {
  let fixtureDirectory: string;

  beforeEach(async () => {
    fixtureDirectory = await mkdtemp(
      path.join(tmpdir(), "contextvault-test-")
    );

    await mkdir(
      path.join(fixtureDirectory, "src"),
      { recursive: true }
    );

    await mkdir(
      path.join(fixtureDirectory, "node_modules"),
      { recursive: true }
    );

    await mkdir(
      path.join(fixtureDirectory, "dist"),
      { recursive: true }
    );

    await mkdir(
      path.join(fixtureDirectory, "build"),
      { recursive: true }
    );

    await writeFile(
      path.join(fixtureDirectory, "src", "app.ts"),
      "export function hello() { return 'world'; }",
      "utf8"
    );

    await writeFile(
      path.join(fixtureDirectory, "README.md"),
      "# ContextVault\n\nProject description.",
      "utf8"
    );

    await writeFile(
      path.join(fixtureDirectory, "node_modules", "ignored.ts"),
      "This file must be ignored.",
      "utf8"
    );

    await writeFile(path.join(fixtureDirectory, "package-lock.json"), "{}", "utf8");
    await writeFile(path.join(fixtureDirectory, "yarn.lock"), "dependency@1.0.0", "utf8");
    await writeFile(path.join(fixtureDirectory, "pnpm-lock.yaml"), "lockfileVersion: 9", "utf8");
    await writeFile(path.join(fixtureDirectory, "custom.lock"), "generated lock data", "utf8");
    await writeFile(path.join(fixtureDirectory, "app.min.js"), "minified();", "utf8");
    await writeFile(path.join(fixtureDirectory, "app.js.map"), "{}", "utf8");
    await writeFile(path.join(fixtureDirectory, "dist", "bundle.js"), "generated();", "utf8");
    await writeFile(path.join(fixtureDirectory, "build", "output.js"), "generated();", "utf8");
  });

  afterEach(async () => {
    await rm(fixtureDirectory, {
      recursive: true,
      force: true
    });
  });

  it("should find TypeScript and Markdown files", async () => {
    const files = await scanProject(
      fixtureDirectory
    );

    const filePaths = files.map(
      (file) => file.path
    );

    expect(filePaths).toContain(
      path.join("src", "app.ts")
    );

    expect(filePaths).toContain(
      "README.md"
    );
  });

  it("should ignore node_modules directories", async () => {
    const files = await scanProject(
      fixtureDirectory
    );

    const filePaths = files.map(
      (file) => file.path
    );

    expect(
      filePaths.some((filePath) =>
        filePath.includes("node_modules")
      )
    ).toBe(false);
  });

  it("should ignore lockfiles, minified assets, source maps, dist, and build", async () => {
    const files = await scanProject(fixtureDirectory);
    const filePaths = files.map((file) => file.path);

    const ignoredPaths = [
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "custom.lock",
      "app.min.js",
      "app.js.map",
      path.join("dist", "bundle.js"),
      path.join("build", "output.js")
    ];

    for (const ignoredPath of ignoredPaths) {
      expect(filePaths).not.toContain(ignoredPath);
    }
  });

  it("should return file metadata correctly", async () => {
    const files = await scanProject(
      fixtureDirectory
    );

    const appFile = files.find(
      (file) => file.path === path.join("src", "app.ts")
    );

    expect(appFile).toBeDefined();

    expect(appFile?.language).toBe("typescript");

    expect(appFile?.mtime).toBeInstanceOf(Date);

    expect(appFile?.size).toBeGreaterThan(0);
  });

  it("should split a 10KB file into four chunks", () => {
    const content = "a".repeat(10 * 1024);

    const file: ProjectFile = {
      path: "large.txt",
      content,
      mtime: new Date(),
      size: Buffer.byteLength(content, "utf8"),
      language: "text"
    };

    const chunks = chunkFile(file);

    expect(chunks).toHaveLength(4);

    expect(chunks[0].chunkIndex).toBe(0);

    expect(chunks[3].chunkIndex).toBe(3);

    for (const chunk of chunks) {
      expect(chunk.filePath).toBe("large.txt");
      expect(chunk.content.length).toBeLessThanOrEqual(3200);
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
    }
  });
});
