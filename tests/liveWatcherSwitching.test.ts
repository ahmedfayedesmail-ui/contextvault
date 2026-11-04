import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import path from "node:path";

import type { FSWatcher } from "chokidar";
import type { ProjectFile } from "../src/types";

const mocks = vi.hoisted(() => ({
  watchProject: vi.fn<
    (rootPath: string, onChange: (file: ProjectFile) => void) => FSWatcher
  >(),
  indexSingleFile: vi.fn<(file: ProjectFile) => Promise<void>>()
}));

vi.mock("../src/indexer/fileWatcher", () => ({
  watchProject: mocks.watchProject
}));

vi.mock("../src/indexer/pipeline", () => ({
  indexSingleFile: mocks.indexSingleFile
}));

import {
  startLiveWatcher,
  stopCurrentWatcher
} from "../src/indexer/liveWatcher";

function createWatcher(): FSWatcher {
  return {
    close: vi.fn(async () => undefined)
  } as unknown as FSWatcher;
}

function createProjectFile(filePath: string): ProjectFile {
  const content = "export const value = true;";

  return {
    path: filePath,
    content,
    mtime: new Date("2026-11-04T10:00:00.000Z"),
    size: Buffer.byteLength(content, "utf8"),
    language: "typescript"
  };
}

beforeEach(async () => {
  await stopCurrentWatcher();

  mocks.watchProject.mockReset();
  mocks.indexSingleFile.mockReset();
  mocks.indexSingleFile.mockResolvedValue(undefined);
});

afterEach(async () => {
  await stopCurrentWatcher();
});

describe("live watcher project switching", () => {
  it("starts monitoring the requested project", async () => {
    const watcher = createWatcher();
    const rootPath = path.resolve("/contextvault-project-a");

    mocks.watchProject.mockReturnValueOnce(watcher);

    await startLiveWatcher(rootPath);

    expect(mocks.watchProject).toHaveBeenCalledTimes(1);
    expect(mocks.watchProject.mock.calls[0]?.[0]).toBe(
      rootPath
    );
  });

  it("does not create duplicate watchers for the same project", async () => {
    const watcher = createWatcher();
    const rootPath = path.resolve("/contextvault-project-a");

    mocks.watchProject.mockReturnValueOnce(watcher);

    await startLiveWatcher(rootPath);
    await startLiveWatcher(rootPath);

    expect(mocks.watchProject).toHaveBeenCalledTimes(1);
    expect(watcher.close).not.toHaveBeenCalled();
  });

  it("closes the previous watcher before monitoring a different project", async () => {
    const firstWatcher = createWatcher();
    const secondWatcher = createWatcher();
    const firstRootPath = path.resolve("/contextvault-project-a");
    const secondRootPath = path.resolve("/contextvault-project-b");

    mocks.watchProject
      .mockReturnValueOnce(firstWatcher)
      .mockReturnValueOnce(secondWatcher);

    await startLiveWatcher(firstRootPath);
    await startLiveWatcher(secondRootPath);

    expect(firstWatcher.close).toHaveBeenCalledTimes(1);
    expect(mocks.watchProject).toHaveBeenCalledTimes(2);
    expect(mocks.watchProject.mock.calls[1]?.[0]).toBe(
      secondRootPath
    );
  });

  it("waits for queued file indexing to finish before switching projects", async () => {
    const firstWatcher = createWatcher();
    const secondWatcher = createWatcher();
    const secondRootPath = path.resolve("/contextvault-project-b");
    let finishIndexing!: () => void;

    const pendingIndexing = new Promise<void>((resolve) => {
      finishIndexing = resolve;
    });

    mocks.watchProject
      .mockReturnValueOnce(firstWatcher)
      .mockReturnValueOnce(secondWatcher);
    mocks.indexSingleFile.mockReturnValueOnce(pendingIndexing);

    await startLiveWatcher(path.resolve("/contextvault-project-a"));

    const onChange = mocks.watchProject.mock.calls[0]?.[1];
    expect(onChange).toBeTypeOf("function");

    onChange?.(createProjectFile("src/pending.ts"));
    await Promise.resolve();

    const switchPromise = startLiveWatcher(secondRootPath);

    await Promise.resolve();

    expect(firstWatcher.close).toHaveBeenCalledTimes(1);
    expect(mocks.watchProject).toHaveBeenCalledTimes(1);

    finishIndexing();
    await switchPromise;

    expect(mocks.watchProject).toHaveBeenCalledTimes(2);
    expect(mocks.watchProject.mock.calls[1]?.[0]).toBe(
      secondRootPath
    );
  });
});
