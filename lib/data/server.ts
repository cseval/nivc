import { getAdminDb } from "@/lib/firebase/admin";
import {
  baseline as fixtureBaseline,
  buildTrackingRows,
  matches as fixtureMatches,
  metadata as fixtureMetadata,
  method as fixtureMethod,
  outreach as fixtureOutreach,
  rankings as fixtureRankings,
  rules as fixtureRules,
  schoolNames as fixtureSchoolNames,
  sourceLog as fixtureSourceLog,
  standings as fixtureStandings
} from "@/lib/data/fixtures";
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

const serverFirebaseEnabled = Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

function iso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return new Date(value).toISOString();
}

async function collectionRows<T>(name: string): Promise<T[]> {
  const snapshot = await getAdminDb().collection(name).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as T);
}

async function safe<T>(live: () => Promise<T>, fallback: T): Promise<T> {
  if (!serverFirebaseEnabled) return fallback;
  try { return await live(); } catch { return fallback; }
}

export const getStandings = () => safe(() => collectionRows<StandingRecord>("standings"), fixtureStandings);
export const getMatches = () => safe(() => collectionRows<MatchInput>("matches"), fixtureMatches);
export const getRankings = () => safe(() => collectionRows<RankingResult>("rankings"), fixtureRankings);
export const getBaseline = () => safe(() => collectionRows<BaselineRecord>("baseline2025"), fixtureBaseline);
export const getOutreach = () => safe(() => collectionRows<OutreachRecord>("outreach"), fixtureOutreach);
export const getSchoolNames = () => safe(() => collectionRows<SchoolNameRecord>("schoolNames"), fixtureSchoolNames);
export const getMethod = () => safe(() => collectionRows<MethodRecord>("method"), fixtureMethod);

export async function getRules(): Promise<RpiRules & { definitions: Array<{ label: string; basis: string; application: string }> }> {
  return safe(async () => (await getAdminDb().doc("config/rules").get()).data() as RpiRules & { definitions: Array<{ label: string; basis: string; application: string }> }, fixtureRules);
}

export async function getTrackingRows(): Promise<TrackingRow[]> {
  if (!serverFirebaseEnabled) return buildTrackingRows();
  try {
    const [standings, rankings, baseline, outreach] = await Promise.all([getStandings(), getRankings(), getBaseline(), getOutreach()]);
    const standingBySchool = new Map(standings.map((row) => [row.school, row]));
    const rankingBySchool = new Map(rankings.map((row) => [row.school, row]));
    const baselineBySchool = new Map(baseline.map((row) => [row.school, row]));
    return outreach.map((record) => ({ id: record.id, school: record.school, standing: standingBySchool.get(record.school) ?? null, ranking: rankingBySchool.get(record.school) ?? null, baseline: baselineBySchool.get(record.school) ?? null, outreach: { ...record, updatedAt: iso(record.updatedAt) } })).sort((left, right) => (left.ranking?.adjustedRank ?? 9999) - (right.ranking?.adjustedRank ?? 9999) || left.school.localeCompare(right.school));
  } catch {
    return buildTrackingRows();
  }
}

export async function getRefreshMetadata(): Promise<RefreshMetadata> {
  return safe(async () => {
    const publication = (await getAdminDb().doc("config/publication").get()).data();
    if (!publication) return fixtureMetadata;
    return { season: 2026, lastSuccessfulRefresh: iso(publication.publishedAt) ?? fixtureMetadata.lastSuccessfulRefresh, schoolCount: publication.schoolCount, matchCount: publication.matchCount, throughGames: publication.throughGames, standingsDiscrepancies: publication.standingsDiscrepancies, unofficialEstimate: true };
  }, fixtureMetadata);
}

export async function getSourceLog(): Promise<SourceLogRecord[]> {
  return safe(async () => {
    const publication = (await getAdminDb().doc("config/publication").get()).data();
    if (!publication?.runId) return fixtureSourceLog;
    const raw = await getAdminDb().collection(`runs/${publication.runId}/raw`).get();
    return raw.docs.map((document) => { const data = document.data(); return { id: document.id, name: data.conferenceId ?? document.id, dataType: data.dataType, url: data.url, fetchedAt: data.fetchedAt, status: data.status === 200 ? "Downloaded" : `HTTP ${data.status}` }; });
  }, fixtureSourceLog);
}
