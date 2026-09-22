import type { RawGame, RawStanding } from "@/lib/pipeline/types";

function readNextData(html: string): any {
  const match = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>(.*?)<\/script>/is.exec(html);
  if (!match) throw new Error("Conference data format changed: missing season data.");
  return JSON.parse(match[1]);
}

export function localDate(iso: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const year = get("year"); const month = get("month"); const day = get("day");
    if (!year || !month || !day) throw new Error("missing date part");
    return `${year}-${month}-${day}`;
  } catch {
    throw new Error(`Unrecognized match time zone: ${timeZone}`);
  }
}

export function parseNextStandings(html: string, conference: { id: string; name: string; url: string }, season = 2026): RawStanding[] {
  const data = readNextData(html);
  if (Number(data.props?.pageProps?.params?.season) !== season) throw new Error(`${conference.name} standings show another season.`);
  const fallback = data.props?.pageProps?.fallback ?? {};
  const entries = Object.entries(fallback).filter(([key]) => key.includes("/standings/table"));
  if (entries.length === 0) throw new Error(`${conference.name} standings are missing.`);
  return entries.flatMap(([, payload]: [string, any]) => (payload.data ?? []).map((team: any) => {
    const overall = String(team.data?.find((item: any) => item.ovr_record)?.ovr_record ?? "").split("-").map(Number);
    const league = String(team.data?.find((item: any) => item.conf_record)?.conf_record ?? "").split("-").map(Number);
    if (league.length !== 2 || league.some(Number.isNaN)) throw new Error(`${conference.name}: missing conference record for ${team.market}.`);
    return { sourceName: team.market, conferenceId: conference.id, conference: conference.name, overallWins: overall[0], overallLosses: overall[1], conferenceWins: league[0], conferenceLosses: league[1], sourceUrl: conference.url };
  }));
}

export function parseNextSchedule(html: string, conference: { id: string; name: string; url: string }, resolve: (name: string, conferenceId: string) => string | null, season = 2026): RawGame[] {
  const data = readNextData(html);
  if (Number(data.props?.pageProps?.params?.season) !== season) throw new Error(`${conference.name} schedule shows another season.`);
  const fallback = data.props?.pageProps?.fallback ?? {};
  const schedules = Object.entries(fallback).filter(([key]) => key.includes('contentTypeUid:"schedule"'));
  const games: RawGame[] = [];
  for (const [, payload] of schedules as Array<[string, any[]]>) {
    for (const game of payload) {
      if (game.results?.status !== "COMPLETE" || game.results?.away_team_is_exhibition || game.results?.home_team_is_exhibition) continue;
      const raw1 = game.teams.away_team[0].market;
      const raw2 = game.teams.home_team[0].market;
      games.push({ date: localDate(game.datetime.date_scheduled, game.datetime.timezone), school1: resolve(raw1, conference.id), school2: resolve(raw2, conference.id), rawSchool1: raw1, rawSchool2: raw2, sets1: Number(game.results.away_points), sets2: Number(game.results.home_points), conferenceId: conference.id, sourceUrl: conference.url });
    }
  }
  return games;
}
