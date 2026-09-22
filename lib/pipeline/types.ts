import type { Division, MatchType } from "@/lib/rpi/types";

export interface ConferenceSource {
  id: string;
  name: string;
  base: string;
  sport: string;
  urls: { standings: string; stats: string };
}

export interface AliasConfig {
  raw: string;
  canonical: string;
}

export interface SourceConfig {
  season: number;
  conferences: ConferenceSource[];
  aliases: Record<string, AliasConfig>;
  nonD1: Record<string, Division>;
  supplements: Array<{ id: string; team: string; url: string; confid: string; file?: string }>;
  corrections: Array<{ date: string; confid: string; team: string; wrong: string; right: string; url: string; note: string }>;
  matchTypes: Array<{ date: string; a: string; b: string; kind: MatchType; note: string; url: string }>;
}

export interface RawStanding {
  sourceName: string;
  conferenceId: string;
  conference: string;
  overallWins: number;
  overallLosses: number;
  conferenceWins: number;
  conferenceLosses: number;
  sourceUrl: string;
}

export interface RawGame {
  date: string;
  school1: string | null;
  school2: string | null;
  rawSchool1: string;
  rawSchool2: string;
  sets1: number;
  sets2: number;
  conferenceId: string;
  sourceUrl: string;
  note?: string;
  matchType?: MatchType;
  typeBasis?: string;
}

export interface ParsedStanding {
  id: string;
  school: string;
  conferenceId: string;
  conference: string;
  sourceName: string;
  overallWins: number;
  overallLosses: number;
  sourceUrl: string;
  pulledAt: string;
  conferenceWins: number;
  conferenceLosses: number;
}

export interface MergedGame {
  id: string;
  date: string;
  school1: string;
  school2: string;
  sets1: number;
  sets2: number;
  division1: Division;
  division2: Division;
  mergeCount: number;
  sources: string[];
  rawNames: string[];
  note: string;
  matchType: MatchType;
  typeBasis: string;
}
