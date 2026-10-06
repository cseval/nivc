import { waitUntil } from "@vercel/functions";
import { assertPipelineSecret } from "@/lib/pipeline/enqueue";
import { runComputeStage } from "@/lib/pipeline/compute-stage";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    assertPipelineSecret(request);
    const { runId } = await request.json();
    if (!runId) return Response.json({ error: "runId is required." }, { status: 400 });
    waitUntil(runComputeStage(runId));
    return Response.json({ runId, status: "accepted", stage: "compute" }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
}
