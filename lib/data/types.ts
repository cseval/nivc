import type { RankingResult } from "@/lib/rpi/types";

export interface StandingRecord {
  id: string;
  school: string;
  conference: string;
  sourceName: string;
  overallWins: number;
  overallLosses: number;
  sourceUrl: string;
  pulledAt: string;
  conferenceWins: number;
  conferenceLosses: number;
}

export interface BaselineRecord {
  id: string;
  rank: number;
  school: string;
  record: string;
  conference: string;
  road: string;
  neutral: string;
  home: string;
  nonDivision1: string;
  previousRank: number;
}

export interface OutreachRecord {
  id: string;
  school: string;
  watchlist: string;
  ncaaSelection: string;
  stage: string;
  owner: string;
  contactName: string;
  email: string;
  lastContact: string | null;
  nextStep: string;
  hostInterest: string;
  notes: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string | null;
}

export type OutreachField = keyof Pick<
  OutreachRecord,
  | "watchlist"
  | "ncaaSelection"
  | "stage"
  | "owner"
  | "contactName"
  | "email"
  | "lastContact"
  | "nextStep"
  | "hostInterest"
  | "notes"
>;

export interface TrackingRow {
  id: string;
  school: string;
  baseline: BaselineRecord | null;
  standing: StandingRecord | null;
  ranking: RankingResult | null;
  outreach: OutreachRecord;
}

export interface SchoolNameRecord {
  id: string;
  sourceName: string;
  standardName: string;
  division: string;
  seenIn: string;
  matchingNote: string;
}

export interface SourceLogRecord {
  id: string;
  name: string;
  dataType: string;
  url: string;
  fetchedAt: string;
  status: string;
}

export interface MethodRecord {
  topic: string;
  details: string;
}

export interface RefreshMetadata {
  season: number;
  lastSuccessfulRefresh: string;
  schoolCount: number;
  matchCount: number;
  throughGames: string;
  standingsDiscrepancies: number;
  unofficialEstimate: boolean;
}

export interface RuleDefinition {
  label: string;
  basis: string;
  application: string;
}
