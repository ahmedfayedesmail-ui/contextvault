import { getLicense } from "../storage/db";

export const FREE_MAX_FILES = 1_000;

export const FREE_FILE_LIMIT_MESSAGE =
  "Free plan supports up to 1,000 files. Upgrade to Pro for unlimited indexing.";

export const MCP_PRO_ONLY_MESSAGE =
  "MCP integration is a Pro feature. Please upgrade to use ContextVault with Cursor or Claude Desktop.";

export const LIVE_WATCH_PRO_ONLY_MESSAGE =
  "Live Monitoring is a Pro feature.";

export class PlanRestrictionError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "PlanRestrictionError";
  }
}

export function requireProFeature(message: string): void {
  if (getLicense() !== "Pro") {
    throw new PlanRestrictionError(message);
  }
}

export function enforceFreeFileLimit(fileCount: number): void {
  if (getLicense() !== "Pro" && fileCount > FREE_MAX_FILES) {
    throw new PlanRestrictionError(FREE_FILE_LIMIT_MESSAGE);
  }
}
