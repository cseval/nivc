import { describe, expect, it } from "vitest";
import standings from "@/fixtures/seed/standings.json";
import matches from "@/fixtures/seed/matches.json";
import rules from "@/fixtures/seed/rules.json";
import expectedRankings from "@/fixtures/seed/expected-rankings.json";
import { computeRankings } from "@/lib/rpi/engine";
import type { MatchInput, RankingResult, RpiRules, TeamInput } from "@/lib/rpi/types";

const teams: TeamInput[] = standings.map((standing) => ({
  school: standing.school,
  conference: standing.conference,
  standingsWins: standing.overallWins,
  standingsLosses: standing.overallLosses
}));

const engineInput = {
  teams,
  matches: matches as MatchInput[],
  rules: rules as RpiRules
};

const numericFields: Array<keyof RankingResult> = [
  "standingsWins",
  "standingsLosses",
  "resultsWins",
  "resultsLosses",
  "nonD1Matches",
  "d1Wins",
  "d1Losses",
  "winPercentage",
  "opponentWinPercentage",
  "opponentsOpponentPercentage",
  "baseRpi",
  "baseRank",
  "topBandWins",
  "secondBandWins",
  "firstBandLosses",
  "severeLosses",
  "nonconferenceMatches",
  "strongNonconferenceMatches",
  "weakNonconferenceMatches",
  "strongNonconferenceShare",
  "weakNonconferenceShare",
  "winBonuses",
  "lossPenalties",
  "scheduleBonus",
  "schedulePenalty",
  "netAdjustment",
  "adjustedRpi",
  "adjustedRank",
  "rankChange"
];

describe("RPI engine parity", () => {
  const actual = computeRankings(engineInput).rankings;
  const actualBySchool = new Map(actual.map((row) => [row.school, row]));

  it("matches every workbook intermediate and output for all 348 schools", () => {
    expect(actual).toHaveLength(348);

    for (const expected of expectedRankings) {
      const row = actualBySchool.get(expected.school);
      expect(row, `missing ${expected.school}`).toBeDefined();
      expect(row!.conference).toBe(expected.conference);
      expect(row!.standingsCheck).toBe(expected.standingsCheck);

      for (const field of numericFields) {
        const actualValue = row![field];
        const expectedValue = expected[field];
        if (actualValue === null || expectedValue === null || expectedValue === "") {
          expect(actualValue, `${expected.school} ${field}`).toBeNull();
        } else {
          expect(
            Math.abs(Number(actualValue) - Number(expectedValue)),
            `${expected.school} ${field}: ${actualValue} vs ${expectedValue}`
          ).toBeLessThanOrEqual(1e-12);
        }
      }
    }
  });

  it("reproduces the seven reviewed standings discrepancies", () => {
    const discrepancies = actual
      .filter((row) => row.standingsCheck !== "Matches standings")
      .map((row) => row.school)
      .sort();

    expect(discrepancies).toEqual(
      [
        "Chicago St.",
        "Delaware St.",
        "Loyola Maryland",
        "Portland",
        "Temple",
        "UC Davis",
        "Western Ky."
      ].sort()
    );
  });

  it("keeps base RPI fixed when a bonus changes", () => {
    const changed = computeRankings({
      ...engineInput,
      rules: { ...(rules as RpiRules), topWinBonus: (rules as RpiRules).topWinBonus * 2 }
    }).rankings;

    for (let index = 0; index < actual.length; index += 1) {
      expect(changed[index].baseRpi).toBe(actual[index].baseRpi);
      expect(changed[index].baseRank).toBe(actual[index].baseRank);
    }
    expect(changed.some((row, index) => row.adjustedRpi !== actual[index].adjustedRpi)).toBe(true);
  });

  it("blanks computed adjustments when the rules are not ready", () => {
    const blocked = computeRankings({
      ...engineInput,
      rules: { ...(rules as RpiRules), status: "Draft" }
    }).rankings;

    expect(blocked.every((row) => row.adjustedRpi === null && row.adjustedRank === null)).toBe(true);
    expect(blocked.every((row) => row.baseRpi !== null && row.baseRank !== null)).toBe(true);
  });
});
