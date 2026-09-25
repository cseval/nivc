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

export type TrackingFilters = RankingFilters & {
  watchlistOnly?: boolean;
  stage?: string;
  owner?: string;
  minimumRank?: number | null;
  maximumRank?: number | null;
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
  });
  return paginate(filtered, page, pageSize, 40, 100);
}
