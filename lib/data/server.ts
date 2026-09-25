import { unstable_cache } from "next/cache";
import { requireApiSession, requirePageSession } from "@/lib/auth/session";
import { DATA_CACHE_TAGS } from "@/lib/data/cache";
import {
  queryMatches,
  queryRankings,
  queryTrackingRows,
  type MatchFilters,
  type RankingFilters,
  type RulesPreviewResult,
  type SchoolScheduleRow,
  type TrackingFilters
} from "@/lib/data/query";
import type {
  BaselineRecord,
  MethodRecord,
  OutreachRecord,
  RefreshMetadata,
  RuleDefinition,
  SchoolNameRecord,
  SourceLogRecord,
  StandingRecord,
  TrackingRow
} from "@/lib/data/types";
import { getAdminDb } from "@/lib/firebase/admin";
import { computeRankings } from "@/lib/rpi/engine";
import { parseRpiRules } from "@/lib/rpi/rules";
import type { MatchInput, RankingResult, RpiRules } from "@/lib/rpi/types";

const CACHE_SECONDS = 300;
const serverFirebaseEnabled = Boolean(
  process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
);

function iso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return new Date(String(value)).toISOString();
}

async function collectionRows<T>(name: string): Promise<T[]> {
  const snapshot = await getAdminDb().collection(name).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as T);
}

async function readData<T>(live: () => Promise<T>, developmentFallback: () => Promise<T>): Promise<T> {
  if (!serverFirebaseEnabled) {
    if (process.env.NODE_ENV === "production") throw new Error("Firebase Admin is required in production.");
    return developmentFallback();
  }
  try {
    return await live();
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    return developmentFallback();
  }
}

async function readStandings(): Promise<StandingRecord[]> {
  return readData(
    () => collectionRows<StandingRecord>("standings"),
    async () => (await import("@/lib/data/fixtures")).standings
  );
}

async function readMatches(): Promise<MatchInput[]> {
  return readData(
    () => collectionRows<MatchInput>("matches"),
    async () => (await import("@/lib/data/fixtures")).matches
  );
}

async function readRankings(): Promise<RankingResult[]> {
  return readData(
    () => collectionRows<RankingResult>("rankings"),
    async () => (await import("@/lib/data/fixtures")).rankings
  );
}

async function readBaseline(): Promise<BaselineRecord[]> {
  return readData(
    () => collectionRows<BaselineRecord>("baseline2025"),
    async () => (await import("@/lib/data/fixtures")).baseline
  );
}

async function readOutreach(): Promise<OutreachRecord[]> {
  return readData(
    async () => (await collectionRows<OutreachRecord>("outreach")).map((record) => ({ ...record, updatedAt: iso(record.updatedAt) })),
    async () => (await import("@/lib/data/fixtures")).outreach
  );
}

async function readSchoolNames(): Promise<SchoolNameRecord[]> {
  return readData(
    () => collectionRows<SchoolNameRecord>("schoolNames"),
    async () => (await import("@/lib/data/fixtures")).schoolNames
  );
}

async function readMethod(): Promise<MethodRecord[]> {
  return readData(
    () => collectionRows<MethodRecord>("method"),
    async () => (await import("@/lib/data/fixtures")).method
  );
}

async function readRules(): Promise<RpiRules & { definitions: RuleDefinition[] }> {
  return readData(async () => {
    const document = await getAdminDb().doc("config/rules").get();
    if (!document.exists) throw new Error("RPI rules are missing from Firestore.");
    const data = document.data() ?? {};
    const definitions = Array.isArray(data.definitions)
      ? data.definitions.filter((definition): definition is RuleDefinition =>
        Boolean(definition)
        && typeof definition.label === "string"
        && typeof definition.basis === "string"
        && typeof definition.application === "string"
      ).map((definition) => ({ label: definition.label, basis: definition.basis, application: definition.application }))
      : [];
    return { ...parseRpiRules(data), definitions };
  }, async () => (await import("@/lib/data/fixtures")).rules);
}

async function readRefreshMetadata(): Promise<RefreshMetadata> {
  return readData(async () => {
    const publication = (await getAdminDb().doc("config/publication").get()).data();
    if (!publication) throw new Error("Publication metadata is missing from Firestore.");
    return {
      season: 2026,
      lastSuccessfulRefresh: iso(publication.publishedAt) ?? String(publication.sourcePulledAt ?? ""),
      schoolCount: Number(publication.schoolCount),
      matchCount: Number(publication.matchCount),
      throughGames: String(publication.throughGames),
      standingsDiscrepancies: Number(publication.standingsDiscrepancies),
      unofficialEstimate: true
    };
  }, async () => (await import("@/lib/data/fixtures")).metadata);
}

async function readSourceLog(): Promise<SourceLogRecord[]> {
  return readData(async () => {
    const publication = (await getAdminDb().doc("config/publication").get()).data();
    if (!publication?.runId) return collectionRows<SourceLogRecord>("sourceLog");
    const raw = await getAdminDb().collection(`runs/${publication.runId}/raw`).get();
    return raw.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        name: data.conferenceId ?? document.id,
        dataType: data.dataType,
        url: data.url,
        fetchedAt: data.fetchedAt,
        status: data.status === 200 ? "Downloaded" : `HTTP ${data.status}`
      };
    });
  }, async () => (await import("@/lib/data/fixtures")).sourceLog);
}

const cachedStandings = unstable_cache(readStandings, ["nivc-standings"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.standings] });
const cachedMatches = unstable_cache(readMatches, ["nivc-matches"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.matches] });
const cachedRankings = unstable_cache(readRankings, ["nivc-rankings"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.rankings] });
const cachedBaseline = unstable_cache(readBaseline, ["nivc-baseline"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.baseline] });
const cachedOutreach = unstable_cache(readOutreach, ["nivc-outreach"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.outreach] });
const cachedSchoolNames = unstable_cache(readSchoolNames, ["nivc-school-names"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.schoolNames] });
const cachedMethod = unstable_cache(readMethod, ["nivc-method"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.method] });
const cachedRules = unstable_cache(readRules, ["nivc-rules"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.rules] });
const cachedRefreshMetadata = unstable_cache(readRefreshMetadata, ["nivc-publication"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.publication] });
const cachedSourceLog = unstable_cache(readSourceLog, ["nivc-source-log"], { revalidate: CACHE_SECONDS, tags: [DATA_CACHE_TAGS.sourceLog, DATA_CACHE_TAGS.publication] });

async function trackingRows(): Promise<TrackingRow[]> {
  const [standings, rankings, baseline, outreach] = await Promise.all([
    cachedStandings(),
    cachedRankings(),
    cachedBaseline(),
    cachedOutreach()
  ]);
  const standingBySchool = new Map(standings.map((row) => [row.school, row]));
  const rankingBySchool = new Map(rankings.map((row) => [row.school, row]));
  const baselineBySchool = new Map(baseline.map((row) => [row.school, row]));
  return outreach
    .map((record) => ({
      id: record.id,
      school: record.school,
      standing: standingBySchool.get(record.school) ?? null,
      ranking: rankingBySchool.get(record.school) ?? null,
      baseline: baselineBySchool.get(record.school) ?? null,
      outreach: record
    }))
    .sort((left, right) =>
      (left.ranking?.adjustedRank ?? 9999) - (right.ranking?.adjustedRank ?? 9999)
      || left.school.localeCompare(right.school)
    );
}

export async function getStandings(): Promise<StandingRecord[]> {
  await requirePageSession();
  return cachedStandings();
}

export async function getRankings(): Promise<RankingResult[]> {
  await requirePageSession();
  return cachedRankings();
}

export async function getSchoolNames(): Promise<SchoolNameRecord[]> {
  await requirePageSession();
  return cachedSchoolNames();
}

export async function getMethod(): Promise<MethodRecord[]> {
  await requirePageSession();
  return cachedMethod();
}

export async function getRules(): Promise<RpiRules & { definitions: RuleDefinition[] }> {
  await requirePageSession();
  return cachedRules();
}

export async function getRefreshMetadata(): Promise<RefreshMetadata> {
  await requirePageSession();
  return cachedRefreshMetadata();
}

export async function getSourceLog(): Promise<SourceLogRecord[]> {
  await requirePageSession();
  return cachedSourceLog();
}

export async function getTrackingOverview() {
  await requirePageSession();
  const rows = await trackingRows();
  return {
    page: queryTrackingRows(rows, {}, 1),
    conferences: Array.from(new Set(rows.map((row) => row.standing?.conference).filter(Boolean))).sort() as string[],
    owners: Array.from(new Set(rows.map((row) => row.outreach.owner).filter(Boolean))).sort(),
    stats: {
      watchlist: rows.filter((row) => row.outreach.watchlist === "Yes").length,
      activeOutreach: rows.filter((row) => !["Not started", "Complete"].includes(row.outreach.stage)).length,
      unassigned: rows.filter((row) => row.outreach.watchlist === "Yes" && !row.outreach.owner).length
    }
  };
}

export async function getMatchesOverview() {
  await requirePageSession();
  const matches = await cachedMatches();
  return {
    page: queryMatches(matches, {}, 1),
    stats: {
      total: matches.length,
      d1: matches.filter((match) => match.division1 === "D1" && match.division2 === "D1").length,
      duplicateReports: matches.reduce((sum, match) => sum + Math.max(0, (match.mergeCount ?? 1) - 1), 0),
      corrections: matches.filter((match) => match.note).length
    }
  };
}

export async function getRankingsOverview() {
  await requirePageSession();
  const rankings = await cachedRankings();
  const sorted = [...rankings].sort((left, right) => (left.adjustedRank ?? 9999) - (right.adjustedRank ?? 9999));
  const biggestGain = [...rankings].sort((left, right) => (right.rankChange ?? 0) - (left.rankChange ?? 0))[0];
  return {
    page: queryRankings(rankings, {}, 1),
    conferences: Array.from(new Set(rankings.map((row) => row.conference))).sort(),
    stats: {
      topRanked: sorted[0]?.school ?? "—",
      biggestGain: biggestGain?.rankChange ?? 0,
      biggestGainSchool: biggestGain?.school ?? "—",
      total: rankings.length,
      reviewFlags: rankings.filter((row) => row.standingsCheck !== "Matches standings").length
    }
  };
}

export async function getTrackingPageForApi(filters: TrackingFilters, page: number) {
  await requireApiSession();
  return queryTrackingRows(await trackingRows(), filters, page);
}

export async function getMatchesPageForApi(filters: MatchFilters, page: number) {
  await requireApiSession();
  return queryMatches(await cachedMatches(), filters, page);
}

export async function getRankingsPageForApi(filters: RankingFilters, page: number) {
  await requireApiSession();
  return queryRankings(await cachedRankings(), filters, page);
}

export async function getSchoolScheduleForApi(school: string): Promise<SchoolScheduleRow[]> {
  await requireApiSession();
  const [matches, rankings] = await Promise.all([cachedMatches(), cachedRankings()]);
  const rankBySchool = new Map(rankings.map((row) => [row.school, row.baseRank]));
  return matches
    .filter((match) => match.division1 === "D1" && match.division2 === "D1" && (match.school1 === school || match.school2 === school))
    .map((match) => {
      const schoolIsFirst = match.school1 === school;
      const opponent = schoolIsFirst ? match.school2 : match.school1;
      const won = schoolIsFirst ? match.sets1 > match.sets2 : match.sets2 > match.sets1;
      return {
        id: match.id,
        date: match.date,
        opponent,
        opponentRank: rankBySchool.get(opponent) ?? null,
        won,
        score: schoolIsFirst ? `${match.sets1}-${match.sets2}` : `${match.sets2}-${match.sets1}`,
        matchType: match.matchType
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

export async function getRulesPreviewForApi(rules: RpiRules): Promise<RulesPreviewResult> {
  await requireApiSession();
  if (rules.status !== "Ready") return { moved: 0, biggestMoves: [] };
  const [matches, standings, currentRankings] = await Promise.all([cachedMatches(), cachedStandings(), cachedRankings()]);
  const teams = standings.map((standing) => ({
    school: standing.school,
    conference: standing.conference,
    standingsWins: standing.overallWins,
    standingsLosses: standing.overallLosses
  }));
  const preview = computeRankings({ teams, matches, rules }).rankings;
  const beforeBySchool = new Map(currentRankings.map((row) => [row.school, row.adjustedRank]));
  const changes = preview.map((row) => {
    const before = beforeBySchool.get(row.school) ?? null;
    const after = row.adjustedRank;
    return {
      school: row.school,
      before,
      after,
      movement: before == null || after == null ? 0 : Math.abs(before - after)
    };
  });
  return {
    moved: changes.filter((row) => row.before !== row.after).length,
    biggestMoves: changes.filter((row) => row.movement > 0).sort((left, right) => right.movement - left.movement).slice(0, 3)
  };
}
