import type { FSWatcher } from "chokidar";

import { watchProject } from "./fileWatcher";
import { indexSingleFile } from "./pipeline";

let liveWatcher: FSWatcher | null = null;
let indexingQueue = Promise.resolve();

export function startLiveWatcher(rootPath: string): void {
  if (liveWatcher) {
    console.info("[Live] A project watcher is already running.");
    return;
  }

  liveWatcher = watchProject(rootPath, (file) => {
    indexingQueue = indexingQueue
      .then(() => indexSingleFile(file))
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
