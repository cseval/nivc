import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { getRulesPreviewForApi } from "@/lib/data/server";
import { apiError, jsonObject } from "@/lib/http/api";
import { parseRpiRules } from "@/lib/rpi/rules";

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const body = await jsonObject(request);
    const preview = await getRulesPreviewForApi(parseRpiRules(body.rules));
    return NextResponse.json(preview, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "The rule preview could not be computed. Review the values and try again.");
  }
}
