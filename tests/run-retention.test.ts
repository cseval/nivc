import { describe, expect, it } from "vitest";
import { buildRunCleanupPlan, type RunRetentionRecord } from "@/lib/pipeline/retention";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12);

function run(
  id: string,
  ageDays: number,
  overrides: Partial<RunRetentionRecord> = {}
): RunRetentionRecord {
  return {
    id,
    status: "succeeded",
    startedAtMs: NOW - ageDays * DAY,
    finishedAtMs: NOW - ageDays * DAY + 60_000,
    payloadsPruned: false,
    ...overrides
  };
}

describe("refresh-run retention", () => {
  it("keeps the seven newest payloads and bounds heavy cleanup", () => {
    const records = Array.from({ length: 12 }, (_value, index) => run(`run-${index}`, index));
    const plan = buildRunCleanupPlan(records, NOW);
    expect(plan.retainedPayloadIds).toEqual(Array.from({ length: 7 }, (_value, index) => `run-${index}`));
    expect(plan.payloadPruneIds).toEqual(["run-11", "run-10", "run-9"]);
    expect(plan.heavyDeleteIds).toEqual([]);
  });

  it("deletes expired summaries only after their payloads are gone", () => {
    const plan = buildRunCleanupPlan([
      ...Array.from({ length: 7 }, (_value, index) => run(`recent-${index}`, index)),
      run("old-pruned", 40, { payloadsPruned: true }),
      run("old-heavy", 45)
    ], NOW);
    expect(plan.heavyDeleteIds).toEqual(["old-heavy"]);
    expect(plan.summaryDeleteIds).toEqual(["old-pruned"]);
  });

  it("marks nonterminal runs older than one day as stalled", () => {
    const plan = buildRunCleanupPlan([
      run("stalled", 2, { status: "fetching", finishedAtMs: null }),
      run("active", 0.5, { status: "parsing", finishedAtMs: null })
    ], NOW);
    expect(plan.stalledRunIds).toEqual(["stalled"]);
  });
});
