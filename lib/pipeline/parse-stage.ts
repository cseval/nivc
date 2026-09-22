import { FieldValue } from "firebase-admin/firestore";
import { sendFailureAlert } from "@/lib/pipeline/alerts";
import sourceConfigJson from "@/fixtures/seed/source-config.json";
import { getAdminDb } from "@/lib/firebase/admin";
import { enqueueStage } from "@/lib/pipeline/enqueue";
import { writeDocuments } from "@/lib/pipeline/firestore";
import { validateParsedDataset } from "@/lib/pipeline/gates";
import { parseRunPayloads, type StoredPayload } from "@/lib/pipeline/parse-run";
import type { SourceConfig } from "@/lib/pipeline/types";

export async function runParseStage(runId: string) {
  const db = getAdminDb();
  const runRef = db.doc(`runs/${runId}`);
  try {
    const run = await runRef.get();
    if (!run.exists) throw new Error(`Run ${runId} does not exist.`);
    if (run.data()?.stages?.parse === "succeeded") {
      await enqueueStage("compute", runId);
      return;
    }
    await runRef.set({ status: "parsing", stages: { parse: "running" }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const raw = await runRef.collection("raw").get();
    const payloads = raw.docs.map((document) => document.data() as StoredPayload);
    const parsed = parseRunPayloads(sourceConfigJson as SourceConfig, payloads);
    validateParsedDataset(parsed.standings, parsed.matches, (sourceConfigJson as SourceConfig).conferences.length);
    await writeDocuments(db, `runs/${runId}/parsedStandings`, parsed.standings);
    await writeDocuments(db, `runs/${runId}/parsedMatches`, parsed.matches);
    await writeDocuments(db, `runs/${runId}/parsedSchoolNames`, parsed.schoolNames);
    await runRef.set({ status: "parsed", stages: { parse: "succeeded" }, counts: { schools: parsed.standings.length, matches: parsed.matches.length, aliases: parsed.schoolNames.length }, sourcePulledAt: parsed.pulledAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await enqueueStage("compute", runId);
  } catch (error) {
    await runRef.set({ status: "failed", stages: { parse: "failed" }, error: error instanceof Error ? error.message : String(error), finishedAt: FieldValue.serverTimestamp() }, { merge: true });
    await sendFailureAlert(runId, "parse", error);
    throw error;
  }
}
