import { load } from "cheerio";
import type { RawGame } from "@/lib/pipeline/types";

function text(value: string): string { return value.replace(/\s+/g, " ").trim(); }

export function parseSupplement(html: string, supplement: { team: string; url: string; confid: string }, resolve: (name: string, conferenceId: string) => string | null): RawGame[] {
  const $ = load(html);
  if (!text($("title").first().text()).includes("2026")) throw new Error(`${supplement.team} schedule season changed.`);
  const tables = $("table.sidearm-schedule-table");
  if (tables.length !== 1) throw new Error(`${supplement.team} supplemental schedule is missing.`);
  const rows = tables.first().find("tr").toArray();
  const cells = (row: unknown) => $(row as never).find("th,td").filter((_, cell) => $(cell).attr("aria-hidden") !== "true").map((_, cell) => text($(cell).text())).get();
  const headers = cells(rows[0]);
  const opponentIndex = headers.indexOf("Opponent");
  const resultIndex = Math.max(headers.indexOf("Time/Result"), headers.indexOf("Result"));
  if (opponentIndex < 0 || resultIndex < 0) throw new Error("Supplemental schedule columns changed.");
  const games: RawGame[] = [];
  for (const row of rows.slice(1)) {
    const values = cells(row);
    if (values.length !== headers.length) continue;
    const score = /\b([WL])\s*,?\s*(\d)\s*-\s*(\d)/.exec(values[resultIndex]);
    if (!score) continue;
    const rawOpponent = values[opponentIndex].replace(/^(?:vs\.?|at)\s+/i, "").trim();
    const opponent = resolve(rawOpponent, supplement.confid);
    if (!opponent) throw new Error(`New opponent needs classification: ${rawOpponent} (${supplement.team}).`);
    const dateText = values[0].replace(/(\d+\/\d+)-\d+(\/\d+)/, "$1$2");
    const [month, day, year] = dateText.split("/").map(Number);
    games.push({ date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, school1: supplement.team, school2: opponent, rawSchool1: supplement.team, rawSchool2: rawOpponent, sets1: Number(score[2]), sets2: Number(score[3]), conferenceId: supplement.confid, sourceUrl: supplement.url, note: "Result supplemented from the conference team schedule." });
  }
  return games;
}
