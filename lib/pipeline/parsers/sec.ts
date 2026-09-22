import { localDate } from "@/lib/pipeline/parsers/next-data";
import type { RawGame, RawStanding } from "@/lib/pipeline/types";

export function parseSec(
  eventsPayloads: unknown[],
  standingsPayload: any,
  conference: { id: string; name: string; standingsUrl: string },
  resolve: (name: string, conferenceId: string) => string | null
): { standings: RawStanding[]; games: RawGame[] } {
  const events = eventsPayloads.flatMap((payload: any) => payload.data ?? []);
  const names = new Map<string, string>();
  for (const game of events) {
    for (const side of ["first_opponent", "second_opponent"]) {
      if (game[side]?.school_id) names.set(String(game[side].school_id), game[side].name);
    }
  }
  const standings = (standingsPayload.data ?? []).map((team: any) => ({ sourceName: names.get(String(team.school_id)) ?? team.school?.name, conferenceId: conference.id, conference: conference.name, overallWins: Number(team.overall_wins), overallLosses: Number(team.overall_loses), conferenceWins: Number(team.conference_wins), conferenceLosses: Number(team.conference_loses), sourceUrl: conference.standingsUrl })) as RawStanding[];
  const games: RawGame[] = [];
  for (const game of events) {
    if (game.status !== "completed" || game.is_exhibition) continue;
    const raw1 = game.first_opponent?.name ?? game.first_opponent_name;
    const raw2 = game.second_opponent?.name ?? game.second_opponent_name;
    games.push({ date: localDate(game.datetime, "America/New_York"), school1: resolve(raw1, conference.id), school2: resolve(raw2, conference.id), rawSchool1: raw1, rawSchool2: raw2, sets1: Number(game.first_opponent_score), sets2: Number(game.second_opponent_score), conferenceId: conference.id, sourceUrl: `https://www.secsports.com/api/schedule-events/${game.id}`, matchType: game.is_conference ? "Conference" : "Nonconference", typeBasis: "SEC match flag" });
  }
  return { standings, games };
}
