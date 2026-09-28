import { load } from "cheerio";
import type { RawGame, RawStanding } from "@/lib/pipeline/types";

function clean(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cells($: ReturnType<typeof load>, row: unknown): string[] {
  return $(row as never)
    .find("th, td")
    .filter((_, cell) => $(cell).attr("aria-hidden") !== "true")
    .map((_, cell) => clean($(cell).text()))
    .get();
}

export function parseSidearmStandings(
  html: string,
  conference: { id: string; name: string; url: string },
  season = 2026
): RawStanding[] {
  const $ = load(html);
  const tables = $("table.sidearm-standings-table").filter((_, table) => clean($(table).find("caption").first().text()).startsWith(String(season)));
  if (tables.length !== 1) throw new Error(`${conference.name} ${season} standings table is missing.`);
  const table = tables.first();
  const headers = cells($, table.find("thead").first());
  const overallIndex = headers.findIndex((header) => ["Overall", "OVERALL", "Ovr", "W-L"].includes(header));
  if (overallIndex < 0) throw new Error(`${conference.name} overall record column is missing.`);
  const conferenceIndexes = headers
    .map((header, index) => (/^(Conf\.?|Conference|Conf\. W-L|ACC|Big South|BW|PL|SLC)$/i.test(header) ? index : -1))
    .filter((index) => index >= 0);
  if (conferenceIndexes.length !== 1) throw new Error(`${conference.name} conference record column is missing or ambiguous.`);
  const conferenceIndex = conferenceIndexes[0];
  const result: RawStanding[] = [];
  table.find("tbody tr").each((_, row) => {
    const values = cells($, row);
    if (values.length !== headers.length) return;
    const overall = values[overallIndex].split("-").map(Number);
    const league = values[conferenceIndex].split("-").map(Number);
    if (overall.length !== 2 || overall.some(Number.isNaN)) throw new Error(`${conference.name} has an invalid standing.`);
    if (league.length !== 2 || league.some(Number.isNaN)) throw new Error(`${conference.name} has an invalid conference standing for ${values[0]}.`);
    result.push({ sourceName: values[0], conferenceId: conference.id, conference: conference.name, overallWins: overall[0], overallLosses: overall[1], conferenceWins: league[0], conferenceLosses: league[1], sourceUrl: conference.url });
  });
  return result;
}

export function parseSidearmResults(
  html: string,
  conference: { id: string; name: string; url: string },
  resolve: (name: string, conferenceId: string) => string | null
): RawGame[] {
  const $ = load(html);
  const tables = $("table").filter((_, table) => clean($(table).find("caption").first().text()) === "Overall Results");
  if (tables.length !== 1) throw new Error(`${conference.name} match results table is missing.`);
  const games: RawGame[] = [];
  tables.first().find("tr").each((_, row) => {
    const values = cells($, row);
    if (values.length !== 3 || values[0] === "Date") return;
    const parsed = /^(.*?)\s+(\d+)\s*-\s*(\d+)\s+(.*?)$/.exec(values[2]);
    if (!parsed) throw new Error(`${conference.name}: unrecognized result ${values[2]}`);
    const [, raw1, sets1, sets2, raw2] = parsed;
    const dateParts = values[0].split("/").map(Number);
    if (dateParts.length !== 3) throw new Error(`${conference.name}: invalid result date ${values[0]}`);
    const date = `${dateParts[2]}-${String(dateParts[0]).padStart(2, "0")}-${String(dateParts[1]).padStart(2, "0")}`;
    games.push({ date, school1: resolve(raw1, conference.id), school2: resolve(raw2, conference.id), rawSchool1: raw1.replace(/^\*/, "").trim(), rawSchool2: raw2.trim(), sets1: Number(sets1), sets2: Number(sets2), conferenceId: conference.id, sourceUrl: conference.url, matchType: raw1.trim().startsWith("*") ? "Conference" : "Nonconference", typeBasis: "Conference results marker (* = conference)" });
  });
  return games;
}
