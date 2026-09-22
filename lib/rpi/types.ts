export type Division = "D1" | "D2" | "D3" | "NAIA" | string;
export type MatchType = "Conference" | "Nonconference";

export interface TeamInput {
  school: string;
  conference: string;
  standingsWins: number;
  standingsLosses: number;
}

export interface MatchInput {
  id: string;
  date: string;
  school1: string;
  school2: string;
  sets1: number;
  sets2: number;
  division1: Division;
  division2: Division;
  matchType: MatchType;
  mergeCount?: number;
  sources?: string[];
  rawNames?: string[];
  note?: string;
  typeBasis?: string;
}

export interface RpiRules {
  topWinBandEnd: number;
  secondWinBandEnd: number;
  strongNonconfBandEnd: number;
  firstLossBandStart: number;
  firstLossBandEnd: number;
  severeLossBandStart: number;
  weakNonconfBandStart: number;
  scheduleThreshold: number;
  topWinBonus: number;
  secondWinBonus: number;
  firstLossPenalty: number;
  severeLossPenalty: number;
  scheduleBonus: number;
  schedulePenalty: number;
  status: string;
  winWeight: number;
  opponentWeight: number;
  opponentsOpponentWeight: number;
}

export interface EngineInput {
  teams: TeamInput[];
  matches: MatchInput[];
  rules: RpiRules;
}

export interface MatchContribution extends MatchInput {
  includeInD1Rpi: boolean;
  school1Win: number;
  school2Win: number;
  school1OpponentWinPercentage: number | null;
  school2OpponentWinPercentage: number | null;
  school1OpponentOwp: number | null;
  school2OpponentOwp: number | null;
  school1BaseRank: number | null;
  school2BaseRank: number | null;
}

export interface RankingResult {
  school: string;
  conference: string;
  standingsWins: number;
  standingsLosses: number;
  resultsWins: number;
  resultsLosses: number;
  nonD1Matches: number;
  d1Wins: number;
  d1Losses: number;
  winPercentage: number | null;
  opponentWinPercentage: number | null;
  opponentsOpponentPercentage: number | null;
  baseRpi: number | null;
  baseRank: number | null;
  standingsCheck: "Matches standings" | "Review: standings differ";
  topBandWins: number | null;
  secondBandWins: number | null;
  firstBandLosses: number | null;
  severeLosses: number | null;
  nonconferenceMatches: number | null;
  strongNonconferenceMatches: number | null;
  weakNonconferenceMatches: number | null;
  strongNonconferenceShare: number | null;
  weakNonconferenceShare: number | null;
  winBonuses: number | null;
  lossPenalties: number | null;
  scheduleBonus: number | null;
  schedulePenalty: number | null;
  netAdjustment: number | null;
  adjustedRpi: number | null;
  adjustedRank: number | null;
  rankChange: number | null;
}

export interface EngineOutput {
  rankings: RankingResult[];
  matches: MatchContribution[];
}
