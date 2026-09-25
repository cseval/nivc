import { Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { requireApiSession } from "@/lib/auth/session";
import { DATA_CACHE_TAGS, invalidateDataCache } from "@/lib/data/cache";
import type { OutreachField } from "@/lib/data/types";
import { getAdminDb } from "@/lib/firebase/admin";
import { apiError, jsonObject, RequestError } from "@/lib/http/api";

const FIELD_LIMITS: Record<OutreachField, number> = {
  watchlist: 16,
  ncaaSelection: 32,
  stage: 32,
  owner: 160,
  contactName: 160,
  email: 254,
  lastContact: 10,
  nextStep: 2000,
  hostInterest: 32,
  notes: 5000
};

const OPTIONS: Partial<Record<OutreachField, Set<string>>> = {
  watchlist: new Set(["No", "Yes"]),
  ncaaSelection: new Set(["Unknown", "Selected", "Bubble", "Not selected"]),
  stage: new Set(["Not started", "Researching", "Contacted", "Follow-up", "Complete"]),
  hostInterest: new Set(["Unknown", "Interested", "Not interested", "Confirmed"])
};

function parseValue(field: OutreachField, value: unknown): string | null {
  if (value === null && field === "lastContact") return null;
  if (typeof value !== "string") throw new RequestError(`${field} must be text.`);
  if (value.length > FIELD_LIMITS[field]) throw new RequestError(`${field} is too long.`);
  if (OPTIONS[field] && !OPTIONS[field]?.has(value)) throw new RequestError(`${field} has an unsupported value.`);
  if (field === "lastContact" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RequestError("Last contact must use YYYY-MM-DD format.");
  }
  if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new RequestError("Contact email must be a valid email address.");
  }
  return value || (field === "lastContact" ? null : "");
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const session = await requireApiSession();
    const { id } = await context.params;
    if (!id || id.length > 240) throw new RequestError("School identifier is invalid.");
    const body = await jsonObject(request);
    if (typeof body.field !== "string" || !(body.field in FIELD_LIMITS)) {
      throw new RequestError("Choose a supported outreach field.");
    }
    const field = body.field as OutreachField;
    const value = parseValue(field, body.value);
    const reference = getAdminDb().doc(`outreach/${id}`);
    if (!(await reference.get()).exists) throw new RequestError("That outreach record no longer exists.", 404);
    const updatedAt = new Date();
    await reference.update({
      [field]: value,
      updatedBy: session.uid,
      updatedByName: session.displayName,
      updatedAt: Timestamp.fromDate(updatedAt)
    });
    invalidateDataCache(DATA_CACHE_TAGS.outreach);
    return NextResponse.json({
      field,
      value,
      updatedBy: session.uid,
      updatedByName: session.displayName,
      updatedAt: updatedAt.toISOString()
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error, "The outreach change was not saved. Refresh the page and try again.");
  }
}
