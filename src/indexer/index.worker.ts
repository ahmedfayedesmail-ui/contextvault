import { parentPort, workerData } from "node:worker_threads";

import { database } from "../storage/db";
import { indexProject } from "./pipeline";

interface IndexWorkerData {
  rootPath: string;
}

if (!parentPort) {
  throw new Error("Index worker must be started from a parent thread.");
}

const port = parentPort;
const { rootPath } = workerData as IndexWorkerData;

async function run(): Promise<void> {
  try {
    const result = await indexProject(rootPath, (progress) => {
      port.postMessage({
        type: "progress",
        progress
      });
    });

    port.postMessage({
      type: "completed",
      result
    });
  } catch (error) {
    port.postMessage({
      type: "failed",
      error: error instanceof Error
        ? error.message
        : String(error)
    });
  } finally {
    database.close();
    port.close();
  }
}

void run();
