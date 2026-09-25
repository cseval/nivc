import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { requireApiSession } from "@/lib/auth/session";
import { apiError } from "@/lib/http/api";
import { createRefreshRun } from "@/lib/pipeline/run";

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const session = await requireApiSession("admin");
    const runId = await createRefreshRun("admin", session.uid);
    return NextResponse.json({ runId, status: "queued" }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error, "The refresh could not be started. Check the server logs and try again.");
  }
}
