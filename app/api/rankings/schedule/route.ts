import { NextResponse } from "next/server";
import { getSchoolScheduleForApi } from "@/lib/data/server";
import { apiError, RequestError } from "@/lib/http/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const school = new URL(request.url).searchParams.get("school")?.trim() ?? "";
    if (!school || school.length > 200) throw new RequestError("Choose a valid school.");
    const schedule = await getSchoolScheduleForApi(school);
    return NextResponse.json({ schedule }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "The school schedule could not be loaded. Close the row and try again.");
  }
}
