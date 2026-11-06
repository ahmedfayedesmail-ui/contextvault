import type { FSWatcher } from "chokidar";

import { watchProject } from "./fileWatcher";
import { indexSingleFile } from "./pipeline";

let liveWatcher: FSWatcher | null = null;
let indexingQueue: Promise<void> = Promise.resolve();
let stopPromise: Promise<void> | null = null;

export function startLiveWatcher(rootPath: string): void {
  if (liveWatcher || stopPromise) {
    console.info("[Live] A project watcher is already active or stopping.");
    return;
  }

  liveWatcher = watchProject(rootPath, (file) => {
    indexingQueue = indexingQueue
      .then(() => indexSingleFile(file, rootPath))
      .then(() => {
        console.info(`[Live] Indexed: ${file.path}`);
      })
      .catch((error: unknown) => {
        console.error(
          `[Live] Failed to index: ${file.path}`,
          error
        );
      });
  });

  console.info(`[Live] Watching: ${rootPath}`);
}

export async function stopLiveWatcher(): Promise<void> {
  if (stopPromise) {
    await stopPromise;
    return;
  }

  const watcher = liveWatcher;
  liveWatcher = null;

  stopPromise = (async () => {
    if (watcher) {
      await watcher.close();
    }

    // Let every file update already queued by the watcher finish before
    // the caller deletes the underlying database rows.
    await indexingQueue;
    console.info("[Live] Project watcher stopped.");
  })();

  try {
    await stopPromise;
  } finally {
    stopPromise = null;
  }
}
