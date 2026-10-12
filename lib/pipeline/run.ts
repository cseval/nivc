import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { enqueueStage } from "@/lib/pipeline/enqueue";
import { buildRunCleanupPlan, type RunRetentionRecord } from "@/lib/pipeline/retention";

const PARSED_ARTIFACT_COLLECTIONS = ["parsedStandings", "parsedMatches", "parsedSchoolNames"] as const;
const ALL_ARTIFACT_COLLECTIONS = ["raw", ...PARSED_ARTIFACT_COLLECTIONS] as const;

function timestampMillis(value: unknown): number | null {
  return value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : null;
}

async function deleteArtifactCollections(runId: string, collections: readonly string[]) {
  const db = getAdminDb();
  const runReference = db.doc(`runs/${runId}`);
  for (const collection of collections) {
    await db.recursiveDelete(runReference.collection(collection));
  }
}

export async function createRefreshRun(trigger: "cron" | "admin", requestedBy?: string) {
  const db = getAdminDb();
  const runRef = db.collection("runs").doc();
  await runRef.set({ status: "queued", trigger, requestedBy: requestedBy ?? trigger, stages: { fetch: "queued", parse: "waiting", compute: "waiting" }, completedFetchTasks: [], startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await enqueueStage("fetch", runRef.id);
  return runRef.id;
}

export async function prunePublishedRunArtifacts(runId: string) {
  await deleteArtifactCollections(runId, PARSED_ARTIFACT_COLLECTIONS);
  await getAdminDb().doc(`runs/${runId}`).set({ parsedArtifactsPrunedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function pruneExpiredRuns() {
  const db = getAdminDb();
  const snapshot = await db.collection("runs").orderBy("startedAt", "desc").limit(100).get();
  const records: RunRetentionRecord[] = snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      status: String(data.status ?? "queued"),
      startedAtMs: timestampMillis(data.startedAt) ?? 0,
      finishedAtMs: timestampMillis(data.finishedAt),
      payloadsPruned: Boolean(data.payloadsPrunedAt)
    };
  });
  const plan = buildRunCleanupPlan(records);

  for (const runId of plan.stalledRunIds) {
    await db.doc(`runs/${runId}`).set({
      status: "failed",
      error: "Refresh expired before completion.",
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  for (const runId of plan.payloadPruneIds) {
    await deleteArtifactCollections(runId, ALL_ARTIFACT_COLLECTIONS);
    await db.doc(`runs/${runId}`).set({ payloadsPrunedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  for (const runId of plan.heavyDeleteIds) {
    await db.recursiveDelete(db.doc(`runs/${runId}`));
  }
  for (const runId of plan.summaryDeleteIds) {
    await db.doc(`runs/${runId}`).delete();
  }

  return {
    retainedPayloads: plan.retainedPayloadIds.length,
    stalledRuns: plan.stalledRunIds.length,
    prunedPayloads: plan.payloadPruneIds.length,
    deletedHeavyRuns: plan.heavyDeleteIds.length,
    deletedSummaries: plan.summaryDeleteIds.length
  };
}
