import type { DocumentData, Firestore } from "firebase-admin/firestore";

export async function writeDocuments(db: Firestore, collectionPath: string, rows: Array<DocumentData & { id: string }>) {
  for (let offset = 0; offset < rows.length; offset += 450) {
    const batch = db.batch();
    for (const row of rows.slice(offset, offset + 450)) {
      const { id, ...data } = row;
      batch.set(db.collection(collectionPath).doc(id), data);
    }
    await batch.commit();
  }
}

export async function deleteMissingDocuments(db: Firestore, collectionPath: string, activeIds: Set<string>) {
  const existing = await db.collection(collectionPath).select().get();
  const stale = existing.docs.filter((document) => !activeIds.has(document.id));
  for (let offset = 0; offset < stale.length; offset += 450) {
    const batch = db.batch();
    stale.slice(offset, offset + 450).forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}
