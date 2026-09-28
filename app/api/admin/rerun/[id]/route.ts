import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http/api";

function timestamp(value: unknown): string | null {
  return value && typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiSession("admin");
    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(id)) return NextResponse.json({ error: "Refresh run ID is invalid." }, { status: 400 });
    const run = await getAdminDb().doc(`runs/${id}`).get();
    if (!run.exists) return NextResponse.json({ error: "Refresh run was not found." }, { status: 404 });
    const data = run.data() ?? {};
    return NextResponse.json({
      id,
      status: String(data.status ?? "queued"),
      stages: data.stages ?? {},
      fetchedTaskCount: Number(data.fetchedTaskCount ?? 0),
      counts: data.counts ?? null,
      throughGames: data.throughGames ?? null,
      error: data.status === "failed" ? String(data.error ?? "The refresh failed without an error message.") : null,
      startedAt: timestamp(data.startedAt),
      updatedAt: timestamp(data.updatedAt),
      finishedAt: timestamp(data.finishedAt)
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "Refresh status could not be loaded. Reload the page and try again.");
  }
}
