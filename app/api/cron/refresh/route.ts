import { createRefreshRun, pruneExpiredRuns } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized cron request." }, { status: 401 });
  }
  try {
    const prunedRuns = await pruneExpiredRuns();
    const runId = await createRefreshRun("cron");
    return Response.json({ runId, status: "queued", prunedRuns }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
