import { NextResponse } from "next/server";
import { getMatchesPageForApi } from "@/lib/data/server";
import { apiError, RequestError } from "@/lib/http/api";

export const dynamic = "force-dynamic";

function text(params: URLSearchParams, name: string, maximum: number): string {
  const value = params.get(name)?.trim() ?? "";
  if (value.length > maximum) throw new RequestError(`${name} is too long.`);
  return value;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const matchType = text(params, "matchType", 32);
    const division = text(params, "division", 16);
    if (matchType && !["Conference", "Nonconference"].includes(matchType)) throw new RequestError("Match type is invalid.");
    if (division && !["D1", "D2", "D3", "NAIA"].includes(division)) throw new RequestError("Division is invalid.");
    const result = await getMatchesPageForApi({
      search: text(params, "search", 200),
      from: text(params, "from", 10),
      through: text(params, "through", 10),
      matchType,
      division
    }, Number(params.get("page") || 1));
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "Matches could not be loaded. Refresh the page and try again.");
  }
}
