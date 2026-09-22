import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendFailureAlert } from "@/lib/pipeline/alerts";
import { deleteMissingDocuments, writeDocuments } from "@/lib/pipeline/firestore";
import { validateComputePublish } from "@/lib/pipeline/gates";
import type { MergedGame, ParsedStanding } from "@/lib/pipeline/types";
import { computeRankings } from "@/lib/rpi/engine";
import type { RpiRules } from "@/lib/rpi/types";
import { slugify } from "@/lib/slug";

export async function runComputeStage(runId: string) {
  const db = getAdminDb();
  const runRef = db.doc(`runs/${runId}`);
  try {
    const run = await runRef.get();
    if (!run.exists) throw new Error(`Run ${runId} does not exist.`);
    if (run.data()?.status === "succeeded") return;
    await runRef.set({ status: "computing", stages: { compute: "running" }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const [standingSnapshot, matchSnapshot, aliasSnapshot, rulesSnapshot, publicationSnapshot, outreachSnapshot] = await Promise.all([
      runRef.collection("parsedStandings").get(),
      runRef.collection("parsedMatches").get(),
      runRef.collection("parsedSchoolNames").get(),
      db.doc("config/rules").get(),
      db.doc("config/publication").get(),
      db.collection("outreach").select().get()
    ]);
    if (!rulesSnapshot.exists) throw new Error("RPI rules are missing.");
    const standings = standingSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })) as ParsedStanding[];
    const matches = matchSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })) as MergedGame[];
    const rules = rulesSnapshot.data() as RpiRules;
    const output = computeRankings({ teams: standings.map((row) => ({ school: row.school, conference: row.conference, standingsWins: row.overallWins, standingsLosses: row.overallLosses })), matches, rules });
    const publication = publicationSnapshot.data();
    validateComputePublish({ standings, matches, rankings: output.rankings, rules, previousSchoolCount: publication?.schoolCount, previousMatchCount: publication?.matchCount, sourcePulledAt: run.data()?.sourcePulledAt ?? "", previousPublishedAt: publication?.sourcePulledAt });

    const rankingRows = output.rankings.map((row) => ({ id: slugify(row.school), ...row, runId }));
    const standingRows = standings.map((row) => ({ ...row, runId }));
    const matchRows = matches.map((row) => ({ ...row, runId }));
    const aliasRows = aliasSnapshot.docs.map((document) => ({ id: document.id, ...document.data(), runId }));
    await writeDocuments(db, "rankings", rankingRows);
    await writeDocuments(db, "standings", standingRows);
    await writeDocuments(db, "matches", matchRows);
    await writeDocuments(db, "schoolNames", aliasRows);
    await deleteMissingDocuments(db, "rankings", new Set(rankingRows.map((row) => row.id)));
    await deleteMissingDocuments(db, "standings", new Set(standingRows.map((row) => row.id)));
    await deleteMissingDocuments(db, "matches", new Set(matchRows.map((row) => row.id)));

    const outreachIds = new Set(outreachSnapshot.docs.map((document) => document.id));
    const newSchools = standings.filter((standing) => !outreachIds.has(standing.id));
    await writeDocuments(db, "outreach", newSchools.map((standing) => ({ id: standing.id, school: standing.school, watchlist: "No", ncaaSelection: "Unknown", stage: "Not started", owner: "", contactName: "", email: "", lastContact: null, nextStep: "", hostInterest: "Unknown", notes: "", updatedBy: "pipeline", updatedByName: "Nightly refresh", updatedAt: FieldValue.serverTimestamp() })));

    const discrepancies = output.rankings.filter((row) => row.standingsCheck !== "Matches standings").length;
    const throughGames = matches.map((match) => match.date).sort().at(-1) ?? null;
    await db.doc("config/publication").set({ runId, schoolCount: standings.length, matchCount: matches.length, sourcePulledAt: run.data()?.sourcePulledAt, throughGames, standingsDiscrepancies: discrepancies, publishedAt: FieldValue.serverTimestamp() });
    await runRef.set({ status: "succeeded", stages: { compute: "succeeded" }, counts: { schools: standings.length, matches: matches.length, discrepancies }, throughGames, finishedAt: FieldValue.serverTimestamp(), error: FieldValue.delete() }, { merge: true });
  } catch (error) {
    await runRef.set({ status: "failed", stages: { compute: "failed" }, error: error instanceof Error ? error.message : String(error), finishedAt: FieldValue.serverTimestamp() }, { merge: true });
    await sendFailureAlert(runId, "compute", error);
    throw error;
  }
}
