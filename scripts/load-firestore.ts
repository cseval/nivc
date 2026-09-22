import { readFile } from "node:fs/promises";
import path from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

async function loadJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), "fixtures", "seed", name), "utf8")) as T;
}

async function writeCollection(collectionName: string, rows: Array<Record<string, unknown> & { id?: string }>) {
  const db = getAdminDb();
  for (let offset = 0; offset < rows.length; offset += 450) {
    const batch = db.batch();
    for (const row of rows.slice(offset, offset + 450)) {
      const id = String(row.id ?? row.school);
      const { id: _id, ...data } = row;
      batch.set(db.collection(collectionName).doc(id), data, { merge: true });
    }
    await batch.commit();
  }
}

async function main() {
  const [standings, matches, rankings, baseline, schoolNames, outreach, rules, method, sourceConfig, sourceLog, metadata] = await Promise.all([
    loadJson<Array<Record<string, unknown> & { id: string }>>("standings.json"),
    loadJson<Array<Record<string, unknown> & { id: string }>>("matches.json"),
    loadJson<Array<Record<string, unknown> & { id: string }>>("expected-rankings.json"),
    loadJson<Array<Record<string, unknown> & { id: string }>>("baseline-2025.json"),
    loadJson<Array<Record<string, unknown> & { id: string }>>("school-names.json"),
    loadJson<Array<Record<string, unknown> & { id: string }>>("outreach.json"),
    loadJson<Record<string, unknown>>("rules.json"),
    loadJson<Array<Record<string, unknown>>>("method.json"),
    loadJson<Record<string, unknown>>("source-config.json"),
    loadJson<Array<Record<string, unknown> & { id: string }>>("source-log.json"),
    loadJson<{ lastSuccessfulRefresh: string; schoolCount: number; matchCount: number; throughGames: string; standingsDiscrepancies: number }>("metadata.json")
  ]);

  await writeCollection("standings", standings);
  await writeCollection("matches", matches);
  await writeCollection("rankings", rankings);
  await writeCollection("baseline2025", baseline);
  await writeCollection("schoolNames", schoolNames);
  await writeCollection("outreach", outreach.map((row) => ({ ...row, updatedAt: FieldValue.serverTimestamp() })));
  const db = getAdminDb();
  await db.doc("config/rules").set(rules);
  await db.doc("config/sources").set(sourceConfig);
  await db.doc("config/publication").set({
    runId: null,
    schoolCount: metadata.schoolCount,
    matchCount: metadata.matchCount,
    throughGames: metadata.throughGames,
    standingsDiscrepancies: metadata.standingsDiscrepancies,
    sourcePulledAt: metadata.lastSuccessfulRefresh,
    publishedAt: new Date(`${metadata.lastSuccessfulRefresh}Z`)
  });
  await writeCollection("method", method.map((row, index) => ({ ...row, id: `topic-${index + 1}` })));
  await writeCollection("sourceLog", sourceLog);
  console.log("Firestore seed complete.");
}

void main();
