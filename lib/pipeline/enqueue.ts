export type PipelineStage = "fetch" | "parse" | "compute";

export async function enqueueStage(stage: PipelineStage, runId: string) {
  const baseUrl = process.env.APP_BASE_URL;
  const secret = process.env.PIPELINE_SECRET;
  if (!baseUrl || !secret) throw new Error("APP_BASE_URL and PIPELINE_SECRET are required for pipeline dispatch.");
  const response = await fetch(`${baseUrl}/api/pipeline/${stage}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pipeline-secret": secret },
    body: JSON.stringify({ runId })
  });
  if (!response.ok) throw new Error(`Pipeline dispatch to ${stage} failed with ${response.status}.`);
}

export function assertPipelineSecret(request: Request) {
  if (!process.env.PIPELINE_SECRET || request.headers.get("x-pipeline-secret") !== process.env.PIPELINE_SECRET) {
    throw new Error("Unauthorized pipeline request.");
  }
}
