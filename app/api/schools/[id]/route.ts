import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { requireApiSession } from "@/lib/auth/session";
import { DATA_CACHE_TAGS, invalidateDataCache } from "@/lib/data/cache";
import { getAdminDb } from "@/lib/firebase/admin";
import { apiError, jsonObject, RequestError, requiredString } from "@/lib/http/api";

const DIVISIONS = new Set(["D1", "D2", "D3", "NAIA"]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    await requireApiSession("admin");
    const { id } = await context.params;
    if (!id || id.length > 240) throw new RequestError("School identifier is invalid.");
    const body = await jsonObject(request);
    const standardName = requiredString(body.standardName, "Standard school name", 200);
    const division = requiredString(body.division, "Division", 16);
    if (!DIVISIONS.has(division)) throw new RequestError("Division must be D1, D2, D3 or NAIA.");
    const reference = getAdminDb().doc(`schoolNames/${id}`);
    if (!(await reference.get()).exists) throw new RequestError("That school alias no longer exists.", 404);
    await reference.update({ standardName, division });
    invalidateDataCache(DATA_CACHE_TAGS.schoolNames);
    return NextResponse.json({ status: "saved", standardName, division }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error, "The school alias was not saved. Refresh the page and try again.");
  }
}
