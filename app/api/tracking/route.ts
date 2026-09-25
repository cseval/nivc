import { NextResponse } from "next/server";
import { getTrackingPageForApi } from "@/lib/data/server";
import { apiError, RequestError } from "@/lib/http/api";

export const dynamic = "force-dynamic";

function text(params: URLSearchParams, name: string, maximum: number): string {
  const value = params.get(name)?.trim() ?? "";
  if (value.length > maximum) throw new RequestError(`${name} is too long.`);
  return value;
}

function optionalRank(params: URLSearchParams, name: string): number | null {
  const value = params.get(name);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9999) throw new RequestError(`${name} must be a whole rank.`);
  return parsed;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const result = await getTrackingPageForApi({
      search: text(params, "search", 200),
      watchlistOnly: params.get("watchlistOnly") === "true",
      stage: text(params, "stage", 32),
      owner: text(params, "owner", 160),
      conference: text(params, "conference", 160),
      minimumRank: optionalRank(params, "minimumRank"),
      maximumRank: optionalRank(params, "maximumRank"),
      reviewOnly: params.get("reviewOnly") === "true"
    }, Number(params.get("page") || 1));
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "Tracking rows could not be loaded. Refresh the page and try again.");
  }
}
