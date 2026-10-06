import sourceConfigJson from "@/fixtures/seed/source-config.json";
import rulesJson from "@/fixtures/seed/rules.json";
import { validateComputePublish, validateParsedDataset } from "@/lib/pipeline/gates";
import { parseRunPayloads, type StoredPayload } from "@/lib/pipeline/parse-run";
import type { ConferenceSource, SourceConfig } from "@/lib/pipeline/types";
import { computeRankings } from "@/lib/rpi/engine";
import type { RpiRules } from "@/lib/rpi/types";

const config = sourceConfigJson as SourceConfig;
const rules = rulesJson as RpiRules;

async function fetchPayload(id: string, url: string): Promise<StoredPayload> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "NIVC-RPI-Tracker/1.0" },
        signal: controller.signal
      });
      const payload = await response.text();
      if (!response.ok) throw new Error(`${id} returned HTTP ${response.status}.`);
      return { id, payload, url, fetchedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function fetchConference(conference: ConferenceSource): Promise<StoredPayload[]> {
  if (conference.id !== "sec") {
    return Promise.all([
      fetchPayload(`${conference.id}-standings`, conference.urls.standings),
      fetchPayload(`${conference.id}-stats`, conference.urls.stats)
    ]);
  }

  const seasonUrl = "https://www.secsports.com/api/schedules?per_page=100&filter%5Bsport_id%5D=14&include%5B%5D=season";
  const seasonPayload = await fetchPayload("sec-seasons", seasonUrl);
  const registry = JSON.parse(seasonPayload.payload);
  const selected = (registry.data ?? []).filter((item: { season?: { name?: string } }) => item.season?.name === "2026");
  if (selected.length !== 1) throw new Error("SEC 2026 season could not be identified.");

  const payloads: StoredPayload[] = [seasonPayload];
  let page = 1;
  let lastPage = 1;
  do {
    const url = `https://www.secsports.com/api/schedule-events?per_page=200&page=${page}&filter%5Bschedule.sport_id%5D=14&filter%5Bschedule.season_id%5D=${selected[0].season_id}&include%5B%5D=firstOpponent.school&include%5B%5D=secondOpponent.school`;
    const events = await fetchPayload(`sec-events-${String(page).padStart(2, "0")}`, url);
    payloads.push(events);
    lastPage = Number(JSON.parse(events.payload).meta?.last_page ?? 1);
    page += 1;
    if (page > 20) throw new Error("Unexpected SEC pagination.");
  } while (page <= lastPage);

  const standingsUrl = `https://www.secsports.com/api/schedules/${selected[0].id}/standings?include%5B%5D=school`;
  payloads.push(await fetchPayload("sec-standings-api", standingsUrl));
  return payloads;
}

async function main() {
  const payloads: StoredPayload[] = [];
  const tasks = [
    ...config.conferences.map((conference) => () => fetchConference(conference)),
    ...config.supplements.map((supplement) => () =>
      fetchPayload(`supplement-${supplement.id}`, supplement.url).then((payload) => [payload])
    )
  ];

  for (let index = 0; index < tasks.length; index += 6) {
    const batch = await Promise.all(tasks.slice(index, index + 6).map((task) => task()));
    payloads.push(...batch.flat());
    console.log(`Fetched ${Math.min(index + 6, tasks.length)} of ${tasks.length} source groups.`);
  }

  const parsed = parseRunPayloads(config, payloads);
  validateParsedDataset(parsed.standings, parsed.matches, config.conferences.length);
  const output = computeRankings({
    teams: parsed.standings.map((row) => ({
      school: row.school,
      conference: row.conference,
      standingsWins: row.overallWins,
      standingsLosses: row.overallLosses
    })),
    matches: parsed.matches,
    rules
  });
  validateComputePublish({
    standings: parsed.standings,
    matches: parsed.matches,
    rankings: output.rankings,
    rules,
    previousSchoolCount: 348,
    previousMatchCount: 1946,
    sourcePulledAt: parsed.pulledAt,
    previousPublishedAt: "2026-09-21T21:35:57Z"
  });

  const discrepancies = output.rankings.filter((row) => row.standingsCheck !== "Matches standings");
  const throughGames = parsed.matches.map((match) => match.date).sort().at(-1) ?? null;
  console.log(JSON.stringify({
    schools: parsed.standings.length,
    matches: parsed.matches.length,
    throughGames,
    standingsDiscrepancies: discrepancies.length,
    discrepancySchools: discrepancies.map((row) => row.school),
    top25: output.rankings
      .filter((row) => row.adjustedRank !== null && row.adjustedRank <= 25)
      .sort((left, right) => left.adjustedRank! - right.adjustedRank!)
      .map((row) => ({ rank: row.adjustedRank, school: row.school, record: `${row.resultsWins}-${row.resultsLosses}` }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
