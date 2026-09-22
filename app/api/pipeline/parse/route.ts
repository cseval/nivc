import { waitUntil } from "@vercel/functions";
import { assertPipelineSecret } from "@/lib/pipeline/enqueue";
import { runParseStage } from "@/lib/pipeline/parse-stage";

export async function POST(request: Request) {
  try {
    assertPipelineSecret(request);
    const { runId } = await request.json();
    if (!runId) return Response.json({ error: "runId is required." }, { status: 400 });
    waitUntil(runParseStage(runId));
    return Response.json({ runId, status: "accepted", stage: "parse" }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
}
