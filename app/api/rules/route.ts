import { Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { requireApiSession } from "@/lib/auth/session";
import { DATA_CACHE_TAGS, invalidateDataCache } from "@/lib/data/cache";
import { getAdminDb } from "@/lib/firebase/admin";
import { apiError, jsonObject, RequestError } from "@/lib/http/api";
import { parseRpiRules, RPI_RULE_NUMBER_FIELDS } from "@/lib/rpi/rules";

export async function PUT(request: NextRequest) {
  try {
    assertCsrf(request);
    const session = await requireApiSession("admin");
    const body = await jsonObject(request);
    const after = parseRpiRules(body.rules);
    const database = getAdminDb();
    const rulesReference = database.doc("config/rules");
    const current = await rulesReference.get();
    if (!current.exists) throw new RequestError("The published RPI rules are missing.", 404);
    const before = parseRpiRules(current.data());
    const changedFields = [...RPI_RULE_NUMBER_FIELDS, "status" as const].filter((field) => before[field] !== after[field]);
    if (!changedFields.length) return NextResponse.json({ status: "unchanged", changedFields: [] });

    const updatedAt = Timestamp.now();
    const historyReference = rulesReference.collection("history").doc();
    const batch = database.batch();
    batch.set(rulesReference, {
      ...after,
      updatedBy: session.uid,
      updatedByName: session.displayName,
      updatedAt
    }, { merge: true });
    batch.create(historyReference, {
      before,
      after,
      changedFields,
      updatedBy: session.uid,
      updatedByName: session.displayName,
      updatedAt
    });
    await batch.commit();
    invalidateDataCache(DATA_CACHE_TAGS.rules);
    return NextResponse.json({ status: "saved", changedFields }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error, "The RPI rules were not saved. Refresh the page and try again.");
  }
}
