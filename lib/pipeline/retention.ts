export const RETAIN_FULL_RUNS = 7;
export const RUN_SUMMARY_RETENTION_DAYS = 30;
export const STALLED_RUN_HOURS = 24;
export const MAX_HEAVY_RUN_DELETIONS = 3;
export const MAX_SUMMARY_DELETIONS = 20;

const TERMINAL_STATUSES = new Set(["failed", "succeeded"]);

export type RunRetentionRecord = {
  id: string;
  status: string;
  startedAtMs: number;
  finishedAtMs: number | null;
  payloadsPruned: boolean;
};

export type RunCleanupPlan = {
  retainedPayloadIds: string[];
  stalledRunIds: string[];
  payloadPruneIds: string[];
  heavyDeleteIds: string[];
  summaryDeleteIds: string[];
};

export function buildRunCleanupPlan(records: RunRetentionRecord[], nowMs = Date.now()): RunCleanupPlan {
  const newestFirst = [...records].sort((left, right) => right.startedAtMs - left.startedAtMs);
  const completed = newestFirst.filter((run) => TERMINAL_STATUSES.has(run.status));
  const retainedPayloadIds = completed.slice(0, RETAIN_FULL_RUNS).map((run) => run.id);
  const retained = new Set(retainedPayloadIds);
  const summaryCutoff = nowMs - RUN_SUMMARY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const stalledCutoff = nowMs - STALLED_RUN_HOURS * 60 * 60 * 1000;
  const stalledRunIds = newestFirst
    .filter((run) => !TERMINAL_STATUSES.has(run.status) && run.startedAtMs < stalledCutoff)
    .map((run) => run.id);
  const eligible = completed
    .filter((run) => !retained.has(run.id))
    .sort((left, right) => left.startedAtMs - right.startedAtMs);
  const heavyCandidates = eligible
    .filter((run) => !run.payloadsPruned)
    .slice(0, MAX_HEAVY_RUN_DELETIONS);
  const heavyDeleteIds = heavyCandidates
    .filter((run) => (run.finishedAtMs ?? run.startedAtMs) < summaryCutoff)
    .map((run) => run.id);
  const heavyDeleteSet = new Set(heavyDeleteIds);
  const payloadPruneIds = heavyCandidates
    .filter((run) => !heavyDeleteSet.has(run.id))
    .map((run) => run.id);
  const summaryDeleteIds = eligible
    .filter((run) => run.payloadsPruned && (run.finishedAtMs ?? run.startedAtMs) < summaryCutoff)
    .slice(0, MAX_SUMMARY_DELETIONS)
    .map((run) => run.id);

  return { retainedPayloadIds, stalledRunIds, payloadPruneIds, heavyDeleteIds, summaryDeleteIds };
}
