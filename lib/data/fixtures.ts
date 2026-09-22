import baselineJson from "@/fixtures/seed/baseline-2025.json";
import expectedRankingsJson from "@/fixtures/seed/expected-rankings.json";
import matchesJson from "@/fixtures/seed/matches.json";
import metadataJson from "@/fixtures/seed/metadata.json";
import methodJson from "@/fixtures/seed/method.json";
import outreachJson from "@/fixtures/seed/outreach.json";
import rulesJson from "@/fixtures/seed/rules.json";
import schoolNamesJson from "@/fixtures/seed/school-names.json";
import sourceConfigJson from "@/fixtures/seed/source-config.json";
import sourceLogJson from "@/fixtures/seed/source-log.json";
import standingsJson from "@/fixtures/seed/standings.json";
import type {
  BaselineRecord,
  MethodRecord,
  OutreachRecord,
  RefreshMetadata,
  SchoolNameRecord,
  SourceLogRecord,
  StandingRecord,
  TrackingRow
} from "@/lib/data/types";
import type { MatchInput, RankingResult, RpiRules } from "@/lib/rpi/types";

export const standings = standingsJson as StandingRecord[];
export const matches = matchesJson as MatchInput[];
export const rankings = expectedRankingsJson as RankingResult[];
export const baseline = baselineJson as BaselineRecord[];
export const outreach = outreachJson as OutreachRecord[];
export const schoolNames = schoolNamesJson as SchoolNameRecord[];
export const sourceLog = sourceLogJson as SourceLogRecord[];
export const method = methodJson as MethodRecord[];
export const metadata = metadataJson as RefreshMetadata;
export const rules = rulesJson as RpiRules & { definitions: Array<{ label: string; basis: string; application: string }> };
export const sourceConfig = sourceConfigJson;

export function buildTrackingRows(): TrackingRow[] {
  const standingBySchool = new Map(standings.map((row) => [row.school, row]));
  const rankingBySchool = new Map(rankings.map((row) => [row.school, row]));
  const baselineBySchool = new Map(baseline.map((row) => [row.school, row]));

  return outreach
    .map((record) => ({
      id: record.id,
      school: record.school,
      baseline: baselineBySchool.get(record.school) ?? null,
      standing: standingBySchool.get(record.school) ?? null,
      ranking: rankingBySchool.get(record.school) ?? null,
      outreach: record
    }))
    .sort((left, right) => {
      const leftRank = left.ranking?.adjustedRank ?? Number.POSITIVE_INFINITY;
      const rightRank = right.ranking?.adjustedRank ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank || left.school.localeCompare(right.school);
    });
}
