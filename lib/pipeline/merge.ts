import type { MatchType } from "@/lib/rpi/types";
import type { MergedGame, ParsedStanding, RawGame, SourceConfig } from "@/lib/pipeline/types";

function validateScore(game: RawGame) {
  if (!/^2026-\d{2}-\d{2}$/.test(game.date)) throw new Error(`Unexpected match season/date: ${game.date}`);
  if (game.sets1 === game.sets2 || Math.max(game.sets1, game.sets2) !== 3 || Math.min(game.sets1, game.sets2) < 0 || Math.min(game.sets1, game.sets2) > 2) {
    throw new Error(`Invalid final match score: ${game.school1} ${game.sets1}-${game.sets2} ${game.school2}`);
  }
}

export function applyCorrections(games: RawGame[], config: SourceConfig): void {
  for (const game of games) {
    for (const correction of config.corrections) {
      if (game.date !== correction.date || game.conferenceId !== correction.confid) continue;
      if (game.school1 === correction.team && game.school2 === correction.wrong) game.school2 = correction.right;
      else if (game.school2 === correction.team && game.school1 === correction.wrong) game.school1 = correction.right;
      else continue;
      game.note = correction.note;
      game.sourceUrl = `${game.sourceUrl} | ${correction.url}`;
    }
  }
}

export function mergeGames(games: RawGame[], standings: ParsedStanding[], config: SourceConfig): MergedGame[] {
  const teamByName = new Map(standings.map((standing) => [standing.school, standing]));
  type Accumulator = Omit<MergedGame, "division1" | "division2" | "matchType" | "typeBasis" | "note" | "sources" | "rawNames"> & {
    sources: Set<string>; rawNames: Set<string>; notes: Set<string>; kinds: Set<MatchType>; bases: Set<string>;
  };
  const merged = new Map<string, Accumulator>();
  const pairDates = new Map<string, string>();

  for (const raw of games) {
    validateScore(raw);
    if (!raw.school1 || !raw.school2) throw new Error(`Unmatched school remains: ${raw.rawSchool1} vs ${raw.rawSchool2}.`);
    if (!teamByName.has(raw.school1) && !config.nonD1[raw.school1]) throw new Error(`Opponent division is unresolved: ${raw.school1}.`);
    if (!teamByName.has(raw.school2) && !config.nonD1[raw.school2]) throw new Error(`Opponent division is unresolved: ${raw.school2}.`);
    const ordered = raw.school1 < raw.school2;
    const school1 = ordered ? raw.school1 : raw.school2;
    const school2 = ordered ? raw.school2 : raw.school1;
    const sets1 = ordered ? raw.sets1 : raw.sets2;
    const sets2 = ordered ? raw.sets2 : raw.sets1;
    const pair = `${raw.date}|${school1}|${school2}`;
    const id = `${pair}|${sets1}|${sets2}`;
    if (pairDates.has(pair) && pairDates.get(pair) !== id) throw new Error(`Conflicting scores or doubleheader needs review: ${pair}. Saved data retained.`);
    pairDates.set(pair, id);
    const entry = merged.get(id) ?? { id, date: raw.date, school1, school2, sets1, sets2, mergeCount: 0, sources: new Set<string>(), rawNames: new Set<string>(), notes: new Set<string>(), kinds: new Set<MatchType>(), bases: new Set<string>() };
    entry.mergeCount += 1;
    raw.sourceUrl.split(" | ").forEach((url) => entry.sources.add(url));
    entry.rawNames.add(`${raw.rawSchool1} / ${raw.rawSchool2}`);
    if (raw.note) entry.notes.add(raw.note);
    if (raw.matchType) entry.kinds.add(raw.matchType);
    if (raw.typeBasis) entry.bases.add(raw.typeBasis);
    merged.set(id, entry);
  }

  return Array.from(merged.values()).map((entry) => {
    const sameConference = teamByName.has(entry.school1) && teamByName.has(entry.school2) && teamByName.get(entry.school1)!.conferenceId === teamByName.get(entry.school2)!.conferenceId;
    if (entry.kinds.size > 1) throw new Error(`Conference-match classification conflicts: ${entry.id}.`);
    let matchType: MatchType;
    let typeBasis: string;
    if (entry.kinds.size === 1) {
      matchType = Array.from(entry.kinds)[0];
      typeBasis = Array.from(entry.bases).join(" | ");
    } else if (sameConference) {
      matchType = "Conference";
      typeBasis = "Inferred from 2026 conference membership; source has no match flag";
    } else {
      matchType = "Nonconference";
      typeBasis = "Different conference membership or non-D1 opponent";
    }
    if (matchType === "Conference" && !sameConference) throw new Error(`Conference flag disagrees with membership: ${entry.id}.`);
    for (const correction of config.matchTypes) {
      if (entry.date === correction.date && entry.school1 === correction.a && entry.school2 === correction.b) {
        matchType = correction.kind;
        typeBasis = correction.note;
        correction.url.split(" | ").forEach((url) => entry.sources.add(url));
        entry.notes.add(correction.note);
      }
    }
    return { id: entry.id, date: entry.date, school1: entry.school1, school2: entry.school2, sets1: entry.sets1, sets2: entry.sets2, division1: teamByName.has(entry.school1) ? "D1" : config.nonD1[entry.school1], division2: teamByName.has(entry.school2) ? "D1" : config.nonD1[entry.school2], mergeCount: entry.mergeCount, sources: Array.from(entry.sources), rawNames: Array.from(entry.rawNames), note: Array.from(entry.notes).join(" | "), matchType, typeBasis };
  }).sort((left, right) => left.date.localeCompare(right.date) || left.school1.localeCompare(right.school1) || left.school2.localeCompare(right.school2));
}
