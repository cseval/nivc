import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { enqueueStage } from "@/lib/pipeline/enqueue";
import { sendFailureAlert } from "@/lib/pipeline/alerts";
import type { ConferenceSource, SourceConfig } from "@/lib/pipeline/types";
import sourceConfigJson from "@/fixtures/seed/source-config.json";

type FetchTask = { id: string; type: "conference"; conference: ConferenceSource } | { id: string; type: "supplement"; supplement: SourceConfig["supplements"][number] };
const config = sourceConfigJson as SourceConfig;

function tasks(): FetchTask[] {
  return [
    ...config.conferences.map((conference) => ({ id: `conference-${conference.id}`, type: "conference" as const, conference })),
    ...config.supplements.map((supplement) => ({ id: `supplement-${supplement.id}`, type: "supplement" as const, supplement }))
  ];
}

async function fetchPayload(url: string, label: string): Promise<{ payload: string; fetchedAt: string; status: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "NIVC-RPI-Tracker/1.0" } });
      const payload = await response.text();
      if (response.status !== 200) throw new Error(`${label} returned HTTP ${response.status}.`);
      return { payload, fetchedAt: new Date().toISOString(), status: response.status };
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function saveRaw(runId: string, id: string, value: Record<string, unknown>) {
  await getAdminDb().doc(`runs/${runId}/raw/${id}`).set({ id, ...value });
}

async function fetchConference(runId: string, conference: ConferenceSource) {
  if (conference.id !== "sec") {
    const [standings, stats] = await Promise.all([
      fetchPayload(conference.urls.standings, `${conference.name} standings`),
      fetchPayload(conference.urls.stats, `${conference.name} match results`)
    ]);
    await Promise.all([
      saveRaw(runId, `${conference.id}-standings`, { ...standings, url: conference.urls.standings, conferenceId: conference.id, dataType: "Standings" }),
      saveRaw(runId, `${conference.id}-stats`, { ...stats, url: conference.urls.stats, conferenceId: conference.id, dataType: "Match results" })
    ]);
    return;
  }

  const seasonUrl = "https://www.secsports.com/api/schedules?per_page=100&filter%5Bsport_id%5D=14&include%5B%5D=season";
  const seasons = await fetchPayload(seasonUrl, "SEC season registry");
  await saveRaw(runId, "sec-seasons", { ...seasons, url: seasonUrl, conferenceId: "sec", dataType: "Season registry" });
  const registry = JSON.parse(seasons.payload);
  const selected = (registry.data ?? []).filter((item: any) => item.season?.name === "2026");
  if (selected.length !== 1) throw new Error("SEC 2026 season could not be identified.");
  const scheduleId = selected[0].id;
  const seasonId = selected[0].season_id;
  let page = 1;
  let lastPage = 1;
  do {
    const url = `https://www.secsports.com/api/schedule-events?per_page=200&page=${page}&filter%5Bschedule.sport_id%5D=14&filter%5Bschedule.season_id%5D=${seasonId}&include%5B%5D=firstOpponent.school&include%5B%5D=secondOpponent.school`;
    const events = await fetchPayload(url, `SEC match results page ${page}`);
    await saveRaw(runId, `sec-events-${String(page).padStart(2, "0")}`, { ...events, url, conferenceId: "sec", dataType: "Match results" });
    lastPage = Number(JSON.parse(events.payload).meta?.last_page ?? 1);
    page += 1;
    if (page > 20) throw new Error("Unexpected SEC pagination.");
  } while (page <= lastPage);
  const standingsUrl = `https://www.secsports.com/api/schedules/${scheduleId}/standings?include%5B%5D=school`;
  const standings = await fetchPayload(standingsUrl, "SEC standings");
  await saveRaw(runId, "sec-standings-api", { ...standings, url: standingsUrl, conferenceId: "sec", dataType: "Standings" });
}

async function executeTask(runId: string, task: FetchTask) {
  if (task.type === "conference") return fetchConference(runId, task.conference);
  const response = await fetchPayload(task.supplement.url, `${task.supplement.team} supplemental schedule`);
  await saveRaw(runId, `supplement-${task.supplement.id}`, { ...response, url: task.supplement.url, conferenceId: task.supplement.confid, dataType: "Supplemental schedule" });
}

export async function runFetchBatch(runId: string) {
  const db = getAdminDb();
  const runRef = db.doc(`runs/${runId}`);
  try {
    const run = await runRef.get();
    if (!run.exists) throw new Error(`Run ${runId} does not exist.`);
    if (run.data()?.status === "succeeded") return;
    const completed = new Set<string>(run.data()?.completedFetchTasks ?? []);
    const pending = tasks().filter((task) => !completed.has(task.id));
    const batch = pending.slice(0, 6);
    await runRef.set({ status: "fetching", stages: { fetch: "running" }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await Promise.all(batch.map((task) => executeTask(runId, task)));
    await runRef.set({ completedFetchTasks: FieldValue.arrayUnion(...batch.map((task) => task.id)), fetchedTaskCount: completed.size + batch.length, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (pending.length > batch.length) await enqueueStage("fetch", runId);
    else {
      await runRef.set({ stages: { fetch: "succeeded" }, fetchedAt: FieldValue.serverTimestamp() }, { merge: true });
      await enqueueStage("parse", runId);
    }
  } catch (error) {
    await runRef.set({ status: "failed", stages: { fetch: "failed" }, error: error instanceof Error ? error.message : String(error), finishedAt: FieldValue.serverTimestamp() }, { merge: true });
    await sendFailureAlert(runId, "fetch", error);
    throw error;
  }
}
