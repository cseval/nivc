import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { slugify } from "@/lib/slug";

const source = process.argv[2] ?? path.join(process.cwd(), "reference", "NIVC_2025-2026_RPI_Tracker_V2.xlsm");
const output = process.argv[3] ?? path.join(process.cwd(), "fixtures", "seed");

const rankingFields = [
  "school", "conference", "standingsWins", "standingsLosses", "resultsWins", "resultsLosses", "nonD1Matches",
  "d1Wins", "d1Losses", "winPercentage", "opponentWinPercentage", "opponentsOpponentPercentage", "baseRpi",
  "baseRank", "standingsCheck", "topBandWins", "secondBandWins", "firstBandLosses", "severeLosses",
  "nonconferenceMatches", "strongNonconferenceMatches", "weakNonconferenceMatches", "strongNonconferenceShare",
  "weakNonconferenceShare", "winBonuses", "lossPenalties", "scheduleBonus", "schedulePenalty", "netAdjustment",
  "adjustedRpi", "adjustedRank", "rankChange"
] as const;

function sheetRows(workbook: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Workbook sheet is missing: ${name}`);
  const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  return all.slice(8).filter((row) => row.some((value) => value !== null && value !== ""));
}

function dateValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return XLSX.SSF.format("yyyy-mm-dd", value);
  return String(value);
}

async function save(name: string, value: unknown) {
  await writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const workbook = XLSX.read(await readFile(source), { type: "buffer", cellDates: true });
  await mkdir(output, { recursive: true });
  const standings = sheetRows(workbook, "Standings").map((row) => ({ id: slugify(String(row[0])), school: row[0], conference: row[1], sourceName: row[2], overallWins: row[3], overallLosses: row[4], sourceUrl: row[5], pulledAt: dateValue(row[6]), conferenceWins: row[7], conferenceLosses: row[8] }));
  const matches = sheetRows(workbook, "Matches").map((row) => ({ id: row[0], date: dateValue(row[1])?.slice(0, 10), school1: row[2], school2: row[3], sets1: row[4], sets2: row[5], division1: row[6], division2: row[7], mergeCount: row[8], sources: String(row[9] ?? "").split(" | ").filter(Boolean), rawNames: String(row[10] ?? "").split(" | ").filter(Boolean), note: row[11] ?? "", matchType: row[12], typeBasis: row[13] }));
  const expectedRankings = sheetRows(workbook, "RPI calculation").map((row) => { const record = Object.fromEntries(rankingFields.map((field, index) => [field, row[index]])) as Record<(typeof rankingFields)[number], unknown>; return { ...record, id: slugify(String(record.school)) }; });
  const baseline = sheetRows(workbook, "NCAA 2025").map((row) => ({ id: slugify(String(row[1])), rank: row[0], school: row[1], record: row[2], conference: row[3], road: row[4], neutral: row[5], home: row[6], nonDivision1: row[7], previousRank: row[8] }));
  const schoolNames = sheetRows(workbook, "School names").map((row, index) => ({ id: `${slugify(String(row[0]))}-${index + 1}`, sourceName: row[0], standardName: row[1], division: row[2], seenIn: row[3], matchingNote: row[4] }));
  const outreach = sheetRows(workbook, "Tracking").map((row) => ({ id: slugify(String(row[0])), school: row[0], watchlist: row[10], ncaaSelection: row[11], stage: row[12], owner: row[13] ?? "", contactName: row[14] ?? "", email: row[15] ?? "", lastContact: dateValue(row[16]), nextStep: row[17] ?? "", hostInterest: row[18], notes: row[19] ?? "", updatedBy: "workbook-migration", updatedByName: "Workbook migration", updatedAt: null }));
  const rulesRows = sheetRows(workbook, "RPI rules");
  const ruleValue = (row: number) => rulesRows[row - 9]?.[1];
  const calc = workbook.Sheets["RPI calculation"];
  const ruleSheet = workbook.Sheets["RPI rules"];
  const rules = { topWinBandEnd: ruleValue(9), secondWinBandEnd: ruleValue(10), strongNonconfBandEnd: ruleValue(11), firstLossBandStart: ruleValue(12), firstLossBandEnd: ruleValue(13), severeLossBandStart: ruleValue(14), weakNonconfBandStart: ruleValue(15), scheduleThreshold: ruleValue(16), topWinBonus: ruleValue(17), secondWinBonus: ruleValue(18), firstLossPenalty: ruleValue(19), severeLossPenalty: ruleValue(20), scheduleBonus: ruleValue(21), schedulePenalty: ruleValue(22), status: ruleSheet.B25?.v, winWeight: calc.T3?.v, opponentWeight: calc.T4?.v, opponentsOpponentWeight: calc.T5?.v, definitions: Array.from({ length: 14 }, (_, index) => ({ label: rulesRows[index]?.[0], basis: rulesRows[index]?.[2], application: rulesRows[index]?.[3] })) };
  const method = sheetRows(workbook, "Read me").map((row) => ({ topic: row[0], details: row[1] }));
  const sourceLog = sheetRows(workbook, "Source log").map((row, index) => ({ id: `source-${index + 1}`, name: row[0], dataType: row[1], url: row[2], fetchedAt: dateValue(row[3]), status: row[4] }));
  const metadata = { season: 2026, lastSuccessfulRefresh: standings.map((row) => row.pulledAt).filter(Boolean).sort().at(-1), schoolCount: standings.length, matchCount: matches.length, throughGames: matches.map((match) => match.date).filter(Boolean).sort().at(-1), standingsDiscrepancies: expectedRankings.filter((row) => row.standingsCheck !== "Matches standings").length, unofficialEstimate: true };
  const sourceConfig = JSON.parse(await readFile(path.join(process.cwd(), "reference", "config.json"), "utf8"));
  await Promise.all([save("standings.json", standings), save("matches.json", matches), save("expected-rankings.json", expectedRankings), save("baseline-2025.json", baseline), save("school-names.json", schoolNames), save("outreach.json", outreach), save("rules.json", rules), save("method.json", method), save("source-log.json", sourceLog), save("metadata.json", metadata), save("source-config.json", sourceConfig)]);
  console.log(`Extracted ${standings.length} schools, ${matches.length} matches and ${expectedRankings.length} ranking rows.`);
}

void main();
