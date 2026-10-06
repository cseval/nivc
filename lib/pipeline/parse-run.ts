import { slugify } from "@/lib/slug";
import { NameResolver } from "@/lib/pipeline/name-resolution";
import { applyCorrections, mergeGames } from "@/lib/pipeline/merge";
import { parseSec } from "@/lib/pipeline/parsers/sec";
import { parseSidearmResults, parseSidearmStandings } from "@/lib/pipeline/parsers/sidearm";
import { parseSupplement } from "@/lib/pipeline/parsers/supplement";
import type { MergedGame, ParsedStanding, RawGame, RawStanding, SourceConfig } from "@/lib/pipeline/types";

export interface StoredPayload { id: string; payload: string; url: string; fetchedAt: string; }

export function parseRunPayloads(config: SourceConfig, payloads: StoredPayload[]) {
  if (config.season !== 2026 || config.conferences.length !== 32) throw new Error("Invalid 2026 source configuration.");
  const byId = new Map(payloads.map((payload) => [payload.id, payload]));
  const resolver = new NameResolver(config);
  const rawStandings: RawStanding[] = [];
  const rawGames: RawGame[] = [];

  for (const conference of config.conferences) {
    if (conference.id === "sec") {
      const eventPayloads = payloads.filter((payload) => payload.id.startsWith("sec-events-")).sort((a, b) => a.id.localeCompare(b.id));
      const standings = byId.get("sec-standings-api");
      if (!eventPayloads.length || !standings) throw new Error("SEC fetch payloads are incomplete.");
      const parsed = parseSec(eventPayloads.map((entry) => JSON.parse(entry.payload)), JSON.parse(standings.payload), { id: conference.id, name: conference.name, standingsUrl: conference.urls.standings }, (name, id) => resolver.resolve(name, id));
      rawStandings.push(...parsed.standings);
      rawGames.push(...parsed.games);
      continue;
    }
    const standingPayload = byId.get(`${conference.id}-standings`);
    const resultPayload = byId.get(`${conference.id}-stats`);
    if (!standingPayload || !resultPayload) throw new Error(`${conference.name} fetch payloads are incomplete.`);
    rawStandings.push(...parseSidearmStandings(standingPayload.payload, { id: conference.id, name: conference.name, url: conference.urls.standings }));
    rawGames.push(...parseSidearmResults(resultPayload.payload, { id: conference.id, name: conference.name, url: conference.urls.stats }, (name, id) => resolver.resolve(name, id)));
  }

  const pulledAt = payloads.map((payload) => payload.fetchedAt).sort().at(-1) ?? new Date(0).toISOString();
  const standings: ParsedStanding[] = rawStandings.map((standing) => {
    const school = resolver.resolve(standing.sourceName, standing.conferenceId);
    if (!school) throw new Error(`Unmatched school name needs review: ${standing.sourceName}.`);
    return { id: slugify(school), school, conferenceId: standing.conferenceId, conference: standing.conference, sourceName: standing.sourceName, overallWins: standing.overallWins, overallLosses: standing.overallLosses, sourceUrl: standing.sourceUrl, pulledAt, conferenceWins: standing.conferenceWins, conferenceLosses: standing.conferenceLosses };
  });

  resolver.corroborate(rawGames);
  applyCorrections(rawGames, config);
  for (const supplement of config.supplements) {
    const payload = byId.get(`supplement-${supplement.id}`);
    if (!payload) throw new Error(`${supplement.team} supplemental payload is missing.`);
    for (const game of parseSupplement(payload.payload, supplement, (name, id) => resolver.resolve(name, id))) {
      const nearby = rawGames.some((existing) => {
        if (!existing.school1 || !existing.school2) return false;
        const samePair = new Set([existing.school1, existing.school2]).size === new Set([game.school1!, game.school2!]).size && [existing.school1, existing.school2].includes(game.school1!) && [existing.school1, existing.school2].includes(game.school2!);
        return samePair && Math.abs(new Date(existing.date).getTime() - new Date(game.date).getTime()) <= 86_400_000;
      });
      if (!nearby) rawGames.push(game);
    }
  }

  const matches: MergedGame[] = mergeGames(rawGames, standings, config);
  return { standings, matches, schoolNames: resolver.usedAliases(), pulledAt };
}
