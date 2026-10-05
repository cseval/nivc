import type { TrackingRow } from "@/lib/data/types";
import type { MatchInput, RankingResult } from "@/lib/rpi/types";

export type PageResult<T> = {
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

export type MatchFilters = {
  search?: string;
  from?: string;
  through?: string;
  matchType?: string;
  division?: string;
};

export type RankingFilters = {
  search?: string;
  conference?: string;
  reviewOnly?: boolean;
};

export const TRACKING_SORT_KEYS = [
  "school",
  "baselineRank",
  "conference",
  "overallRecord",
  "conferenceRecord",
  "adjustedRank",
  "baseRank",
  "rankChange",
  "adjustedRpi",
  "baseRpi",
  "resultsRecord",
  "d1Record",
  "nonD1Matches",
  "baselineRecord",
  "watchlist",
  "ncaaSelection",
  "stage",
  "owner",
  "contactName",
  "email",
  "lastContact",
  "hostInterest",
  "nextStep",
  "notes",
  "dataCheck",
  "recordDifference"
] as const;

export type TrackingSortKey = typeof TRACKING_SORT_KEYS[number];
export type SortDirection = "asc" | "desc";

export type TrackingFilters = RankingFilters & {
  watchlistOnly?: boolean;
  stage?: string;
  owner?: string;
  minimumRank?: number | null;
  maximumRank?: number | null;
  sortKey?: TrackingSortKey;
  sortDirection?: SortDirection;
};

export type SchoolScheduleRow = {
  id: string;
  date: string;
  opponent: string;
  opponentRank: number | null;
  won: boolean;
  score: string;
  matchType: string;
};

export type RulesPreviewResult = {
  moved: number;
  biggestMoves: Array<{
    school: string;
    before: number | null;
    after: number | null;
    movement: number;
  }>;
};

function normalizedPage(value: number | undefined): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function normalizedPageSize(value: number | undefined, defaultSize: number, maximumSize: number): number {
  if (!Number.isInteger(value) || Number(value) < 1) return defaultSize;
  return Math.min(Number(value), maximumSize);
}

const textCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function isTrackingSortKey(value: string): value is TrackingSortKey {
  return (TRACKING_SORT_KEYS as readonly string[]).includes(value);
}

export function defaultTrackingSortDirection(sortKey: TrackingSortKey): SortDirection {
  switch (sortKey) {
    case "overallRecord":
    case "conferenceRecord":
    case "rankChange":
    case "adjustedRpi":
    case "baseRpi":
    case "resultsRecord":
    case "d1Record":
    case "baselineRecord":
    case "watchlist":
    case "lastContact":
    case "recordDifference":
      return "desc";
    default:
      return "asc";
  }
}

function compareNullable<T>(
  left: T | null | undefined,
  right: T | null | undefined,
  direction: SortDirection,
  compare: (leftValue: T, rightValue: T) => number
): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const result = compare(left, right);
  return direction === "asc" ? result : -result;
}

function normalizedText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function compareText(left: string | null | undefined, right: string | null | undefined, direction: SortDirection): number {
  return compareNullable(normalizedText(left), normalizedText(right), direction, (leftValue, rightValue) => textCollator.compare(leftValue, rightValue));
}

function compareNumber(left: number | null | undefined, right: number | null | undefined, direction: SortDirection): number {
  return compareNullable(left, right, direction, (leftValue, rightValue) => leftValue - rightValue);
}

type WinLossRecord = { wins: number; losses: number };

function compareRecord(left: WinLossRecord | null, right: WinLossRecord | null, direction: SortDirection): number {
  return compareNullable(left, right, direction, (leftValue, rightValue) => {
    const leftGames = leftValue.wins + leftValue.losses;
    const rightGames = rightValue.wins + rightValue.losses;
    const leftPercentage = leftGames ? leftValue.wins / leftGames : 0;
    const rightPercentage = rightGames ? rightValue.wins / rightGames : 0;
    return leftPercentage - rightPercentage
      || leftValue.wins - rightValue.wins
      || rightValue.losses - leftValue.losses;
  });
}

function parseRecord(value: string | null | undefined): WinLossRecord | null {
  const match = value?.match(/(\d+)\s*-\s*(\d+)/);
  return match ? { wins: Number(match[1]), losses: Number(match[2]) } : null;
}

function trackingRecordDifference(row: TrackingRow): number | null {
  if (!row.standing || !row.ranking) return null;
  return Math.abs(row.standing.overallWins - row.ranking.resultsWins)
    + Math.abs(row.standing.overallLosses - row.ranking.resultsLosses);
}

function compareTrackingRows(left: TrackingRow, right: TrackingRow, sortKey: TrackingSortKey, direction: SortDirection): number {
  let result = 0;
  switch (sortKey) {
    case "school":
      result = compareText(left.school, right.school, direction);
      break;
    case "baselineRank":
      result = compareNumber(left.baseline?.rank, right.baseline?.rank, direction);
      break;
    case "conference":
      result = compareText(left.standing?.conference ?? left.ranking?.conference, right.standing?.conference ?? right.ranking?.conference, direction);
      break;
    case "overallRecord":
      result = compareRecord(
        left.standing ? { wins: left.standing.overallWins, losses: left.standing.overallLosses } : null,
        right.standing ? { wins: right.standing.overallWins, losses: right.standing.overallLosses } : null,
        direction
      );
      break;
    case "conferenceRecord":
      result = compareRecord(
        left.standing ? { wins: left.standing.conferenceWins, losses: left.standing.conferenceLosses } : null,
        right.standing ? { wins: right.standing.conferenceWins, losses: right.standing.conferenceLosses } : null,
        direction
      );
      break;
    case "adjustedRank":
      result = compareNumber(left.ranking?.adjustedRank, right.ranking?.adjustedRank, direction);
      break;
    case "baseRank":
      result = compareNumber(left.ranking?.baseRank, right.ranking?.baseRank, direction);
      break;
    case "rankChange":
      result = compareNumber(left.ranking?.rankChange, right.ranking?.rankChange, direction);
      break;
    case "adjustedRpi":
      result = compareNumber(left.ranking?.adjustedRpi, right.ranking?.adjustedRpi, direction);
      break;
    case "baseRpi":
      result = compareNumber(left.ranking?.baseRpi, right.ranking?.baseRpi, direction);
      break;
    case "resultsRecord":
      result = compareRecord(
        left.ranking ? { wins: left.ranking.resultsWins, losses: left.ranking.resultsLosses } : null,
        right.ranking ? { wins: right.ranking.resultsWins, losses: right.ranking.resultsLosses } : null,
        direction
      );
      break;
    case "d1Record":
      result = compareRecord(
        left.ranking ? { wins: left.ranking.d1Wins, losses: left.ranking.d1Losses } : null,
        right.ranking ? { wins: right.ranking.d1Wins, losses: right.ranking.d1Losses } : null,
        direction
      );
      break;
    case "nonD1Matches":
      result = compareNumber(left.ranking?.nonD1Matches, right.ranking?.nonD1Matches, direction);
      break;
    case "baselineRecord":
      result = compareRecord(parseRecord(left.baseline?.record), parseRecord(right.baseline?.record), direction);
      break;
    case "watchlist":
      result = compareText(left.outreach.watchlist, right.outreach.watchlist, direction);
      break;
    case "ncaaSelection":
      result = compareText(left.outreach.ncaaSelection, right.outreach.ncaaSelection, direction);
      break;
    case "stage":
      result = compareText(left.outreach.stage, right.outreach.stage, direction);
      break;
    case "owner":
      result = compareText(left.outreach.owner, right.outreach.owner, direction);
      break;
    case "contactName":
      result = compareText(left.outreach.contactName, right.outreach.contactName, direction);
      break;
    case "email":
      result = compareText(left.outreach.email, right.outreach.email, direction);
      break;
    case "lastContact":
      result = compareText(left.outreach.lastContact, right.outreach.lastContact, direction);
      break;
    case "hostInterest":
      result = compareText(left.outreach.hostInterest, right.outreach.hostInterest, direction);
      break;
    case "nextStep":
      result = compareText(left.outreach.nextStep, right.outreach.nextStep, direction);
      break;
    case "notes":
      result = compareText(left.outreach.notes, right.outreach.notes, direction);
      break;
    case "dataCheck":
      result = compareNumber(
        left.ranking == null ? null : Number(left.ranking.standingsCheck === "Matches standings"),
        right.ranking == null ? null : Number(right.ranking.standingsCheck === "Matches standings"),
        direction
      );
      break;
    case "recordDifference":
      result = compareNumber(trackingRecordDifference(left), trackingRecordDifference(right), direction);
      break;
  }
  return result || textCollator.compare(left.school, right.school);
}

export function paginate<T>(rows: T[], page?: number, pageSize?: number, defaultSize = 50, maximumSize = 100): PageResult<T> {
  const safePageSize = normalizedPageSize(pageSize, defaultSize, maximumSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / safePageSize));
  const safePage = Math.min(normalizedPage(page), pageCount);
  const offset = (safePage - 1) * safePageSize;
  return {
    items: rows.slice(offset, offset + safePageSize),
    page: safePage,
    pageCount,
    pageSize: safePageSize,
    total: rows.length
  };
}

export function queryMatches(matches: MatchInput[], filters: MatchFilters, page?: number, pageSize?: number): PageResult<MatchInput> {
  const needle = filters.search?.trim().toLowerCase() ?? "";
  const filtered = matches
    .filter((match) => !needle || `${match.school1} ${match.school2}`.toLowerCase().includes(needle))
    .filter((match) => !filters.from || match.date >= filters.from)
    .filter((match) => !filters.through || match.date <= filters.through)
    .filter((match) => !filters.matchType || match.matchType === filters.matchType)
    .filter((match) => {
      if (!filters.division) return true;
      if (filters.division === "D1") return match.division1 === "D1" && match.division2 === "D1";
      return match.division1 === filters.division || match.division2 === filters.division;
    })
    .sort((left, right) => right.date.localeCompare(left.date) || left.school1.localeCompare(right.school1));
  return paginate(filtered, page, pageSize, 100, 200);
}

export function queryRankings(rows: RankingResult[], filters: RankingFilters, page?: number, pageSize?: number): PageResult<RankingResult> {
  const needle = filters.search?.trim().toLowerCase() ?? "";
  const filtered = rows
    .filter((row) => !needle || row.school.toLowerCase().includes(needle))
    .filter((row) => !filters.conference || row.conference === filters.conference)
    .filter((row) => !filters.reviewOnly || row.standingsCheck !== "Matches standings")
    .sort((left, right) => (left.adjustedRank ?? 9999) - (right.adjustedRank ?? 9999) || left.school.localeCompare(right.school));
  return paginate(filtered, page, pageSize, 50, 100);
}

export function queryTrackingRows(rows: TrackingRow[], filters: TrackingFilters, page?: number, pageSize?: number): PageResult<TrackingRow> {
  const needle = filters.search?.trim().toLowerCase() ?? "";
  const sortKey = filters.sortKey ?? "adjustedRank";
  const sortDirection = filters.sortDirection ?? defaultTrackingSortDirection(sortKey);
  const filtered = rows.filter((row) => {
    const adjustedRank = row.ranking?.adjustedRank ?? null;
    if (needle && !`${row.school} ${row.outreach.notes} ${row.outreach.nextStep}`.toLowerCase().includes(needle)) return false;
    if (filters.watchlistOnly && row.outreach.watchlist !== "Yes") return false;
    if (filters.stage && row.outreach.stage !== filters.stage) return false;
    if (filters.owner && row.outreach.owner !== filters.owner) return false;
    if (filters.conference && row.standing?.conference !== filters.conference) return false;
    if (filters.minimumRank != null && (adjustedRank == null || adjustedRank < filters.minimumRank)) return false;
    if (filters.maximumRank != null && (adjustedRank == null || adjustedRank > filters.maximumRank)) return false;
    if (filters.reviewOnly && row.ranking?.standingsCheck === "Matches standings") return false;
    return true;
  }).sort((left, right) => compareTrackingRows(left, right, sortKey, sortDirection));
  return paginate(filtered, page, pageSize, 40, 100);
}
