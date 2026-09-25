import { NextResponse } from "next/server";
import { getRankingsPageForApi } from "@/lib/data/server";
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
    const result = await getRankingsPageForApi({
      search: text(params, "search", 200),
      conference: text(params, "conference", 160),
      reviewOnly: params.get("reviewOnly") === "true"
    }, Number(params.get("page") || 1));
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "Rankings could not be loaded. Refresh the page and try again.");
  }
}
