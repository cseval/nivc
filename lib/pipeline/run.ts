import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { enqueueStage } from "@/lib/pipeline/enqueue";

export async function createRefreshRun(trigger: "cron" | "admin", requestedBy?: string) {
  const db = getAdminDb();
  const runRef = db.collection("runs").doc();
  await runRef.set({ status: "queued", trigger, requestedBy: requestedBy ?? trigger, stages: { fetch: "queued", parse: "waiting", compute: "waiting" }, completedFetchTasks: [], startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await enqueueStage("fetch", runRef.id);
  return runRef.id;
}

export async function pruneExpiredRuns() {
  const db = getAdminDb();
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const expired = await db.collection("runs").where("finishedAt", "<", cutoff).limit(20).get();
  await Promise.all(expired.docs.map((document) => db.recursiveDelete(document.ref)));
  return expired.size;
}
