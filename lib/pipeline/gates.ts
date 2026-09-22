import type { MergedGame, ParsedStanding } from "@/lib/pipeline/types";
import type { RankingResult, RpiRules } from "@/lib/rpi/types";

export function validateParsedDataset(standings: ParsedStanding[], matches: MergedGame[], conferenceCount: number) {
  if (conferenceCount !== 32) throw new Error(`Expected 32 conferences, received ${conferenceCount}. Saved data retained.`);
  if (standings.length < 330 || standings.length > 370) throw new Error(`Unexpected D1 team count: ${standings.length}. Saved data retained.`);
  if (matches.length < 1000 || matches.length >= 10000) throw new Error(`Unexpected merged match count: ${matches.length}. Saved data retained.`);
  if (new Set(standings.map((row) => row.school)).size !== standings.length) throw new Error("Duplicate D1 school names remain after normalization. Saved data retained.");
}

export function validateComputePublish(input: {
  standings: ParsedStanding[];
  matches: MergedGame[];
  rankings: RankingResult[];
  rules: RpiRules;
  previousSchoolCount?: number;
  previousMatchCount?: number;
  sourcePulledAt: string;
  previousPublishedAt?: string;
}) {
  const { standings, matches, rankings, rules } = input;
  const weightTotal = rules.winWeight + rules.opponentWeight + rules.opponentsOpponentWeight;
  if (Math.abs(weightTotal - 1) > 1e-12) throw new Error(`RPI weights sum to ${weightTotal}, not 1. Saved data retained.`);
  if (input.previousSchoolCount != null && Math.abs(standings.length - input.previousSchoolCount) > 10) throw new Error(`D1 school count moved from ${input.previousSchoolCount} to ${standings.length}. Saved data retained.`);
  if (input.previousMatchCount != null && matches.length < input.previousMatchCount * 0.95) throw new Error(`Match count ${matches.length} is below 95% of the prior ${input.previousMatchCount}. Saved data retained.`);
  if (input.previousPublishedAt && input.sourcePulledAt < input.previousPublishedAt) throw new Error("The source data is older than the published dataset. Saved data retained.");
  if (rankings.length !== standings.length || rankings.some((row) => row.baseRank == null || (rules.status === "Ready" && row.adjustedRank == null))) throw new Error("Rank columns are not fully populated. Saved data retained.");
}
