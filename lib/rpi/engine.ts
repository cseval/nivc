import type {
  EngineInput,
  EngineOutput,
  MatchContribution,
  MatchInput,
  RankingResult,
  TeamInput
} from "@/lib/rpi/types";

type BaseRecord = {
  team: TeamInput;
  resultsWins: number;
  resultsLosses: number;
  d1Wins: number;
  d1Losses: number;
  nonD1Matches: number;
  winPercentage: number | null;
  opponentWinPercentage: number | null;
  opponentsOpponentPercentage: number | null;
  baseRpi: number | null;
  baseRank: number | null;
};

function competitionRanks(values: Array<number | null>): Array<number | null> {
  return values.map((value) => {
    if (value === null) return null;
    let better = 0;
    for (const other of values) {
      if (other !== null && other > value) better += 1;
    }
    return 1 + better;
  });
}

function winner(match: MatchInput, side: 1 | 2): boolean {
  return side === 1 ? match.sets1 > match.sets2 : match.sets2 > match.sets1;
}

function teamMatches(matches: MatchInput[], school: string): MatchInput[] {
  return matches.filter((match) => match.school1 === school || match.school2 === school);
}

function opponentOf(match: MatchInput, school: string): { school: string; division: string; side: 1 | 2 } {
  if (match.school1 === school) {
    return { school: match.school2, division: match.division2, side: 2 };
  }
  return { school: match.school1, division: match.division1, side: 1 };
}

function d1PairKey(school1: string, school2: string): string {
  return school1.localeCompare(school2, "en", { sensitivity: "variant" }) <= 0
    ? `${school1}\u0000${school2}`
    : `${school2}\u0000${school1}`;
}

export function computeRankings(input: EngineInput): EngineOutput {
  const { teams, matches, rules } = input;
  const teamNames = new Set(teams.map((team) => team.school));
  const baseBySchool = new Map<string, BaseRecord>();
  const matchesBySchool = new Map<string, MatchInput[]>();

  for (const team of teams) matchesBySchool.set(team.school, []);
  for (const match of matches) {
    if (matchesBySchool.has(match.school1)) matchesBySchool.get(match.school1)!.push(match);
    if (matchesBySchool.has(match.school2)) matchesBySchool.get(match.school2)!.push(match);
  }

  for (const team of teams) {
    let resultsWins = 0;
    let resultsLosses = 0;
    let d1Wins = 0;
    let d1Losses = 0;
    const scheduled = matchesBySchool.get(team.school) ?? [];

    for (const match of scheduled) {
      const side: 1 | 2 = match.school1 === team.school ? 1 : 2;
      const won = winner(match, side);
      if (won) resultsWins += 1;
      else resultsLosses += 1;
      if (match.division1 === "D1" && match.division2 === "D1") {
        if (won) d1Wins += 1;
        else d1Losses += 1;
      }
    }

    const d1Games = d1Wins + d1Losses;
    baseBySchool.set(team.school, {
      team,
      resultsWins,
      resultsLosses,
      d1Wins,
      d1Losses,
      nonD1Matches: resultsWins + resultsLosses - d1Games,
      winPercentage: d1Games === 0 ? null : d1Wins / d1Games,
      opponentWinPercentage: null,
      opponentsOpponentPercentage: null,
      baseRpi: null,
      baseRank: null
    });
  }

  const pairStats = new Map<string, { games: number; wins: Map<string, number> }>();
  for (const match of matches) {
    if (match.division1 !== "D1" || match.division2 !== "D1") continue;
    const key = d1PairKey(match.school1, match.school2);
    const stats = pairStats.get(key) ?? { games: 0, wins: new Map<string, number>() };
    stats.games += 1;
    const winningSchool = winner(match, 1) ? match.school1 : match.school2;
    stats.wins.set(winningSchool, (stats.wins.get(winningSchool) ?? 0) + 1);
    pairStats.set(key, stats);
  }

  const perMatchOwp = new Map<string, { school1: number | null; school2: number | null }>();
  for (const match of matches) {
    if (match.division1 !== "D1" || match.division2 !== "D1") {
      perMatchOwp.set(match.id, { school1: 0, school2: 0 });
      continue;
    }
    const pair = pairStats.get(d1PairKey(match.school1, match.school2))!;
    const team1 = baseBySchool.get(match.school1)!;
    const team2 = baseBySchool.get(match.school2)!;
    const team1Denominator = team2.d1Wins + team2.d1Losses - pair.games;
    const team2Denominator = team1.d1Wins + team1.d1Losses - pair.games;
    perMatchOwp.set(match.id, {
      school1:
        team1Denominator === 0
          ? null
          : (team2.d1Wins - (pair.wins.get(match.school2) ?? 0)) / team1Denominator,
      school2:
        team2Denominator === 0
          ? null
          : (team1.d1Wins - (pair.wins.get(match.school1) ?? 0)) / team2Denominator
    });
  }

  for (const team of teams) {
    const record = baseBySchool.get(team.school)!;
    const d1Matches = (matchesBySchool.get(team.school) ?? []).filter(
      (match) => match.division1 === "D1" && match.division2 === "D1"
    );
    if (d1Matches.length === 0) continue;
    let sum = 0;
    let valid = true;
    for (const match of d1Matches) {
      const contribution = perMatchOwp.get(match.id)!;
      const value = match.school1 === team.school ? contribution.school1 : contribution.school2;
      if (value === null) {
        valid = false;
        break;
      }
      sum += value;
    }
    record.opponentWinPercentage = valid ? sum / d1Matches.length : null;
  }

  for (const team of teams) {
    const record = baseBySchool.get(team.school)!;
    const d1Matches = (matchesBySchool.get(team.school) ?? []).filter(
      (match) => match.division1 === "D1" && match.division2 === "D1"
    );
    if (record.winPercentage === null || record.opponentWinPercentage === null || d1Matches.length === 0) {
      continue;
    }
    let sum = 0;
    let valid = true;
    for (const match of d1Matches) {
      const opponent = opponentOf(match, team.school).school;
      const opponentOwp = baseBySchool.get(opponent)?.opponentWinPercentage ?? null;
      if (opponentOwp === null) {
        valid = false;
        break;
      }
      sum += opponentOwp;
    }
    if (!valid) continue;
    record.opponentsOpponentPercentage = sum / d1Matches.length;
    record.baseRpi =
      rules.winWeight * record.winPercentage +
      rules.opponentWeight * record.opponentWinPercentage +
      rules.opponentsOpponentWeight * record.opponentsOpponentPercentage;
  }

  const baseRanks = competitionRanks(teams.map((team) => baseBySchool.get(team.school)!.baseRpi));
  teams.forEach((team, index) => {
    baseBySchool.get(team.school)!.baseRank = baseRanks[index];
  });

  const ready = rules.status === "Ready";
  const rankings: RankingResult[] = teams.map((team) => {
    const record = baseBySchool.get(team.school)!;
    let topBandWins = 0;
    let secondBandWins = 0;
    let firstBandLosses = 0;
    let severeLosses = 0;
    let nonconferenceMatches = 0;
    let strongNonconferenceMatches = 0;
    let weakNonconferenceMatches = 0;

    for (const match of matchesBySchool.get(team.school) ?? []) {
      const side: 1 | 2 = match.school1 === team.school ? 1 : 2;
      const won = winner(match, side);
      const opponent = opponentOf(match, team.school);
      const isD1 = match.division1 === "D1" && match.division2 === "D1";
      const opponentRank = isD1 ? baseBySchool.get(opponent.school)?.baseRank ?? null : null;

      if (isD1 && won && opponentRank !== null) {
        if (opponentRank >= 1 && opponentRank <= rules.topWinBandEnd) topBandWins += 1;
        if (opponentRank > rules.topWinBandEnd && opponentRank <= rules.secondWinBandEnd) {
          secondBandWins += 1;
        }
      }
      if (isD1 && !won && opponentRank !== null) {
        if (opponentRank >= rules.firstLossBandStart && opponentRank <= rules.firstLossBandEnd) {
          firstBandLosses += 1;
        }
        if (opponentRank >= rules.severeLossBandStart) severeLosses += 1;
      }
      if (!isD1 && !won && opponent.division !== "D1") severeLosses += 1;

      if (match.matchType === "Nonconference") {
        nonconferenceMatches += 1;
        if (
          isD1 &&
          opponentRank !== null &&
          opponentRank >= 1 &&
          opponentRank <= rules.strongNonconfBandEnd
        ) {
          strongNonconferenceMatches += 1;
        }
        if (isD1 && opponentRank !== null && opponentRank >= rules.weakNonconfBandStart) {
          weakNonconferenceMatches += 1;
        }
        if (!isD1 && opponent.division === "NAIA") weakNonconferenceMatches += 1;
      }
    }

    const strongShare =
      nonconferenceMatches === 0 ? null : strongNonconferenceMatches / nonconferenceMatches;
    const weakShare = nonconferenceMatches === 0 ? null : weakNonconferenceMatches / nonconferenceMatches;
    const winBonuses = ready
      ? topBandWins * rules.topWinBonus + secondBandWins * rules.secondWinBonus
      : null;
    const lossPenalties = ready
      ? -firstBandLosses * rules.firstLossPenalty - severeLosses * rules.severeLossPenalty
      : null;
    const scheduleBonus = ready
      ? nonconferenceMatches === 0
        ? 0
        : strongShare !== null && strongShare >= rules.scheduleThreshold
          ? rules.scheduleBonus
          : 0
      : null;
    const schedulePenalty = ready
      ? nonconferenceMatches === 0
        ? 0
        : weakShare !== null && weakShare >= rules.scheduleThreshold
          ? -rules.schedulePenalty
          : 0
      : null;
    const netAdjustment = ready
      ? (winBonuses ?? 0) + (lossPenalties ?? 0) + (scheduleBonus ?? 0) + (schedulePenalty ?? 0)
      : null;
    const adjustedRpi =
      record.baseRpi === null || netAdjustment === null ? null : record.baseRpi + netAdjustment;

    return {
      school: team.school,
      conference: team.conference,
      standingsWins: team.standingsWins,
      standingsLosses: team.standingsLosses,
      resultsWins: record.resultsWins,
      resultsLosses: record.resultsLosses,
      nonD1Matches: record.nonD1Matches,
      d1Wins: record.d1Wins,
      d1Losses: record.d1Losses,
      winPercentage: record.winPercentage,
      opponentWinPercentage: record.opponentWinPercentage,
      opponentsOpponentPercentage: record.opponentsOpponentPercentage,
      baseRpi: record.baseRpi,
      baseRank: record.baseRank,
      standingsCheck:
        team.standingsWins === record.resultsWins && team.standingsLosses === record.resultsLosses
          ? "Matches standings"
          : "Review: standings differ",
      topBandWins: ready ? topBandWins : null,
      secondBandWins: ready ? secondBandWins : null,
      firstBandLosses: ready ? firstBandLosses : null,
      severeLosses: ready ? severeLosses : null,
      nonconferenceMatches: ready ? nonconferenceMatches : null,
      strongNonconferenceMatches: ready ? strongNonconferenceMatches : null,
      weakNonconferenceMatches: ready ? weakNonconferenceMatches : null,
      strongNonconferenceShare: ready ? strongShare : null,
      weakNonconferenceShare: ready ? weakShare : null,
      winBonuses,
      lossPenalties,
      scheduleBonus,
      schedulePenalty,
      netAdjustment,
      adjustedRpi,
      adjustedRank: null,
      rankChange: null
    };
  });

  const adjustedRanks = competitionRanks(rankings.map((ranking) => ranking.adjustedRpi));
  rankings.forEach((ranking, index) => {
    ranking.adjustedRank = adjustedRanks[index];
    ranking.rankChange =
      ranking.baseRank === null || ranking.adjustedRank === null
        ? null
        : ranking.baseRank - ranking.adjustedRank;
  });

  const contributions: MatchContribution[] = matches.map((match) => {
    const owp = perMatchOwp.get(match.id) ?? { school1: 0, school2: 0 };
    return {
      ...match,
      includeInD1Rpi: match.division1 === "D1" && match.division2 === "D1",
      school1Win: winner(match, 1) ? 1 : 0,
      school2Win: winner(match, 2) ? 1 : 0,
      school1OpponentWinPercentage: owp.school1,
      school2OpponentWinPercentage: owp.school2,
      school1OpponentOwp:
        match.division1 === "D1" && match.division2 === "D1"
          ? baseBySchool.get(match.school2)?.opponentWinPercentage ?? null
          : 0,
      school2OpponentOwp:
        match.division1 === "D1" && match.division2 === "D1"
          ? baseBySchool.get(match.school1)?.opponentWinPercentage ?? null
          : 0,
      school1BaseRank: teamNames.has(match.school1) ? baseBySchool.get(match.school1)?.baseRank ?? null : 0,
      school2BaseRank: teamNames.has(match.school2) ? baseBySchool.get(match.school2)?.baseRank ?? null : 0
    };
  });

  return { rankings, matches: contributions };
}

export { competitionRanks };
