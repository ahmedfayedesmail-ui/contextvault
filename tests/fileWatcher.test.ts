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
  countProjectFiles,
  chunkFile
} from "../src/indexer/fileWatcher";

import { MAX_FILE_SIZE_BYTES } from "../src/config/ignorePatterns";

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

  it("counts eligible files with the same exclusions and can stop early", async () => {
    expect(await countProjectFiles(fixtureDirectory)).toBe(2);
    expect(await countProjectFiles(fixtureDirectory, 1)).toBe(1);
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

  it("should ignore structured and generated data files", async () => {
    const ignoredNames = [
      "payload.json",
      "metadata.xml",
      "events.log",
      "export.csv",
      "settings.yaml",
      "settings.yml"
    ];

    for (const name of ignoredNames) {
      await writeFile(path.join(fixtureDirectory, name), "generated data", "utf8");
    }

    const files = await scanProject(fixtureDirectory);
    const filePaths = files.map((file) => file.path);

    for (const name of ignoredNames) {
      expect(filePaths).not.toContain(name);
    }
  });

  it("caps indexable files at 500 KiB", async () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(500 * 1024);

    const boundaryPath = path.join(fixtureDirectory, "src", "boundary.txt");
    const oversizedPath = path.join(fixtureDirectory, "src", "oversized.txt");

    await writeFile(boundaryPath, "x".repeat(500 * 1024), "utf8");
    await writeFile(oversizedPath, "x".repeat(500 * 1024 + 1), "utf8");

    const files = await scanProject(fixtureDirectory);
    const filePaths = files.map((file) => file.path);

    expect(filePaths).toContain(path.join("src", "boundary.txt"));
    expect(filePaths).not.toContain(path.join("src", "oversized.txt"));
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

  it("should add file and language context to code embeddings without changing the source snippet", () => {
    const content = "export function hello() { return 'world'; }";
    const file: ProjectFile = {
      path: path.join("src", "app.ts"),
      content,
      mtime: new Date(),
      size: Buffer.byteLength(content, "utf8"),
      language: "typescript"
    };

    const [chunk] = chunkFile(file);

    expect(chunk?.content).toBe(content);
    expect(chunk?.embeddingText).toBe(
      "File: " + path.join("src", "app.ts") +
      " | Language: typescript\n" + content
    );
  });

  it("should not add code context metadata to Markdown chunks", () => {
    const file: ProjectFile = {
      path: "README.md",
      content: "# ContextVault",
      mtime: new Date(),
      size: 13,
      language: "markdown"
    };

    const [chunk] = chunkFile(file);

    expect(chunk?.content).toBe("# ContextVault");
    expect(chunk?.embeddingText).toBeUndefined();
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
