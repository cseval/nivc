import { createRefreshRun, pruneExpiredRuns } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized cron request." }, { status: 401 });
  }
  try {
    let cleanup: Awaited<ReturnType<typeof pruneExpiredRuns>> | { error: string };
    try {
      cleanup = await pruneExpiredRuns();
    } catch (cleanupError) {
      console.error("Historical refresh cleanup failed.", cleanupError);
      cleanup = { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) };
    }
    const runId = await createRefreshRun("cron");
    return Response.json({ runId, status: "queued", cleanup }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
