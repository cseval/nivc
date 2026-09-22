import { describe, expect, it } from "vitest";
import sourceConfigJson from "@/fixtures/seed/source-config.json";
import rulesJson from "@/fixtures/seed/rules.json";
import { validateComputePublish, validateParsedDataset } from "@/lib/pipeline/gates";
import { mergeGames } from "@/lib/pipeline/merge";
import { NameResolver } from "@/lib/pipeline/name-resolution";
import type { ParsedStanding, RawGame, SourceConfig } from "@/lib/pipeline/types";
import type { RpiRules } from "@/lib/rpi/types";

const config = sourceConfigJson as SourceConfig;
const standings: ParsedStanding[] = [
  { id: "alpha", school: "Alpha", conferenceId: "acc", conference: "ACC", sourceName: "Alpha", overallWins: 1, overallLosses: 0, conferenceWins: 0, conferenceLosses: 0, sourceUrl: "https://one.test", pulledAt: "2026-09-01T00:00:00Z" },
  { id: "beta", school: "Beta", conferenceId: "big10", conference: "Big Ten", sourceName: "Beta", overallWins: 0, overallLosses: 1, conferenceWins: 0, conferenceLosses: 0, sourceUrl: "https://two.test", pulledAt: "2026-09-01T00:00:00Z" }
];

function game(overrides: Partial<RawGame> = {}): RawGame {
  return {
    date: "2026-09-01",
    school1: "Alpha",
    school2: "Beta",
    rawSchool1: "Alpha",
    rawSchool2: "Beta",
    sets1: 3,
    sets2: 1,
    conferenceId: "acc",
    sourceUrl: "https://one.test",
    ...overrides
  };
}

describe("pipeline safety and reconciliation", () => {
  it("uses conference context for the two Miami programs", () => {
    const resolver = new NameResolver(config);
    expect(resolver.resolve("Miami", "acc")).toBe("Miami (FL)");
    expect(resolver.resolve("Miami", "mac")).toBe("Miami (OH)");
    expect(resolver.resolve("Miami", "unknown")).toBeNull();
  });

  it("corroborates an ambiguous Loyola against an independent report", () => {
    const resolver = new NameResolver(config);
    const games = [
      game({ school1: null, rawSchool1: "Loyola", school2: "Denver", rawSchool2: "Denver", sets1: 3, sets2: 0, conferenceId: "patriot" }),
      game({ school1: "Denver", rawSchool1: "Denver", school2: "Loyola Chicago", rawSchool2: "Loyola Chicago", sets1: 0, sets2: 3, conferenceId: "summit" })
    ];
    resolver.corroborate(games);
    expect(games[0].school1).toBe("Loyola Chicago");
  });

  it("deduplicates identical reports and preserves every source", () => {
    const merged = mergeGames([game(), game({ sourceUrl: "https://two.test", conferenceId: "big10" })], standings, config);
    expect(merged).toHaveLength(1);
    expect(merged[0].mergeCount).toBe(2);
    expect(merged[0].sources).toEqual(expect.arrayContaining(["https://one.test", "https://two.test"]));
  });

  it("rejects conflicting reports before publication", () => {
    expect(() => mergeGames([game(), game({ sets1: 0, sets2: 3 })], standings, config)).toThrow(/Conflicting scores/);
  });

  it("rejects incomplete or implausible parsed datasets", () => {
    expect(() => validateParsedDataset([], [], 31)).toThrow(/32 conferences/);
  });

  it("rejects invalid RPI weights before any publish", () => {
    const rules = { ...(rulesJson as RpiRules), winWeight: 0.3 };
    expect(() => validateComputePublish({ standings: [], matches: [], rankings: [], rules, sourcePulledAt: "2026-09-01T00:00:00Z" })).toThrow(/weights sum/);
  });
});
