import type { FSWatcher } from "chokidar";

import path from "node:path";

import { watchProject } from "./fileWatcher";
import { indexSingleFile } from "./pipeline";

let liveWatcher: FSWatcher | null = null;
let liveWatcherRootPath: string | null = null;
let indexingQueue: Promise<void> = Promise.resolve();
let lifecycleQueue: Promise<void> = Promise.resolve();

function enqueueLifecycleOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = lifecycleQueue.then(operation);

  // Keep the lifecycle queue usable after a failed operation while
  // returning the original error to the caller.
  lifecycleQueue = result.then(
    () => undefined,
    () => undefined
  );

  return result;
}

async function closeCurrentWatcher(): Promise<void> {
  const watcher = liveWatcher;
  liveWatcher = null;
  liveWatcherRootPath = null;

  try {
    if (watcher) {
      await watcher.close();
    }
  } finally {
    // Finish every update accepted by the old watcher before a caller
    // can clear the index or start monitoring a different project.
    await indexingQueue;
  }

  if (watcher) {
    console.info("[Live] Project watcher stopped.");
  }
}

export function startLiveWatcher(rootPath: string): Promise<void> {
  const normalizedRootPath = path.resolve(
    path.normalize(rootPath)
  );
  const comparableRootPath =
    process.platform === "win32"
      ? normalizedRootPath.toLowerCase()
      : normalizedRootPath;

  return enqueueLifecycleOperation(async () => {
    if (
      liveWatcher &&
      liveWatcherRootPath === comparableRootPath
    ) {
      console.info(
        "[Live] Project watcher is already active for this project."
      );
      return;
    }

    // Switching projects is a lifecycle transition: close the old
    // watcher and drain its queue before attaching the new watcher.
    await closeCurrentWatcher();

    liveWatcher = watchProject(
      normalizedRootPath,
      (file) => {
        indexingQueue = indexingQueue
          .then(() => indexSingleFile(file))
          .then(() => {
            console.info("[Live] Indexed: " + file.path);
          })
          .catch((error: unknown) => {
            console.error(
              "[Live] Failed to index: " + file.path,
              error
            );
          });
      }
    );

    liveWatcherRootPath = comparableRootPath;
    console.info("[Live] Watching: " + normalizedRootPath);
  });
}

export function stopCurrentWatcher(): Promise<void> {
  return enqueueLifecycleOperation(closeCurrentWatcher);
}

// Keep the existing API name available to callers that stop monitoring
// before clearing the index.
export function stopLiveWatcher(): Promise<void> {
  return stopCurrentWatcher();
}
