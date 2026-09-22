const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendFailureAlert(runId: string, stage: string, error: unknown): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !from || !to) return;

  const message = error instanceof Error ? error.message : String(error);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: to.split(",").map((address) => address.trim()).filter(Boolean),
        subject: `NIVC RPI refresh failed during ${stage}`,
        html: `<p>The nightly NIVC RPI refresh failed.</p><dl><dt>Run</dt><dd>${escapeHtml(runId)}</dd><dt>Stage</dt><dd>${escapeHtml(stage)}</dd><dt>Error</dt><dd>${escapeHtml(message)}</dd></dl>`
      })
    });
    if (!response.ok) console.error("Failed to send refresh alert", response.status, await response.text());
  } catch (alertError) {
    console.error("Failed to send refresh alert", alertError);
  }
}
