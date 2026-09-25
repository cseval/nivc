"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { responseMessage, secureFetch } from "@/lib/auth/client";
import type { RulesPreviewResult } from "@/lib/data/query";
import type { RuleDefinition } from "@/lib/data/types";
import type { RpiRules } from "@/lib/rpi/types";

const fields: Array<{ key: keyof RpiRules; label: string; step: string }> = [
  { key: "topWinBandEnd", label: "Top-win band ends", step: "1" },
  { key: "secondWinBandEnd", label: "Second win band ends", step: "1" },
  { key: "strongNonconfBandEnd", label: "Strong nonconference band ends", step: "1" },
  { key: "firstLossBandStart", label: "First loss band starts", step: "1" },
  { key: "firstLossBandEnd", label: "First loss band ends", step: "1" },
  { key: "severeLossBandStart", label: "Severe loss band starts", step: "1" },
  { key: "weakNonconfBandStart", label: "Weak nonconference band starts", step: "1" },
  { key: "scheduleThreshold", label: "Scheduling threshold", step: "0.01" },
  { key: "topWinBonus", label: "Top-win bonus", step: "0.0001" },
  { key: "secondWinBonus", label: "Second-band win bonus", step: "0.0001" },
  { key: "firstLossPenalty", label: "First-band loss penalty", step: "0.0001" },
  { key: "severeLossPenalty", label: "Severe loss penalty", step: "0.0001" },
  { key: "scheduleBonus", label: "Strong-schedule bonus", step: "0.0001" },
  { key: "schedulePenalty", label: "Weak-schedule penalty", step: "0.0001" }
];

export function RulesForm({
  initialRules,
  definitions
}: {
  initialRules: RpiRules;
  definitions: RuleDefinition[];
}) {
  const session = useSession();
  const canEdit = session.role === "admin";
  const [draft, setDraft] = useState(initialRules);
  const [savedRules, setSavedRules] = useState(initialRules);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<RulesPreviewResult>({ moved: 0, biggestMoves: [] });
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "error">("loading");
  const definitionByLabel = useMemo(() => new Map(definitions.map((item) => [item.label, item])), [definitions]);
  const changedFields = fields.filter(({ key }) => draft[key] !== savedRules[key]);

  useEffect(() => {
    if (draft.status !== "Ready") {
      setPreview({ moved: 0, biggestMoves: [] });
      setPreviewStatus("ready");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPreviewStatus("loading");
      try {
        const response = await secureFetch("/api/rules/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rules: draft }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(await responseMessage(response, "The rule preview could not be computed."));
        setPreview(await response.json() as RulesPreviewResult);
        setPreviewStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPreviewStatus("error");
      }
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft]);

  async function saveRules() {
    if (!canEdit || (changedFields.length === 0 && draft.status === savedRules.status)) return;
    setStatus("saving");
    try {
      const response = await secureFetch("/api/rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: draft })
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The RPI rules were not saved."));
      setSavedRules(draft);
      setStatus("saved");
      window.setTimeout(() => setStatus(""), 1600);
    } catch (error) {
      setStatus(error instanceof Error ? `error:${error.message}` : "error:The RPI rules were not saved.");
    }
  }

  return <>
    <section className="card">
      <div className="page-header rules-header"><div><h2>Adjustment assumptions</h2><p>Preview recomputes from the stored match ledger. Base RPI never changes.</p></div><div className="dashboard-actions"><label className="form-group"><span>Assumption check</span><select disabled={!canEdit} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Ready</option><option>Draft</option><option>Review</option></select></label><button className="btn btn-primary" disabled={!canEdit || status === "saving" || (changedFields.length === 0 && draft.status === savedRules.status)} onClick={() => void saveRules()}>{status === "saving" ? "Saving rules…" : "Save rule changes"}</button></div></div>
      {!canEdit ? <div className="status-note status-note-warning">Rule changes require an administrator account. You can still preview the published values.</div> : null}
      {draft.status !== "Ready" ? <div className="status-note status-note-warning">Adjusted RPI and adjusted rank are unavailable until the assumption check is Ready.</div> : null}
      {status === "saved" ? <div className="status-note status-note-success">Rules saved. The edit history records this change.</div> : null}
      {status.startsWith("error:") ? <div className="status-note status-note-error" role="alert">{status.slice(6)}</div> : null}
      {previewStatus === "error" ? <div className="status-note status-note-error" role="alert">The preview could not be computed. Review the values, then change a field to run it again.</div> : null}
      <dl className="rule-preview" aria-busy={previewStatus === "loading"}><div><dt>Schools moving</dt><dd>{previewStatus === "loading" ? "…" : preview.moved}</dd></div><div><dt>Rules changed</dt><dd>{changedFields.length}</dd></div><div><dt>Largest move</dt><dd>{previewStatus === "loading" ? "…" : preview.biggestMoves[0]?.movement ?? 0}</dd></div></dl>
      {previewStatus === "loading" ? <p className="data-muted">Computing the rank preview…</p> : preview.biggestMoves.length ? <p className="data-muted">Largest preview changes: {preview.biggestMoves.map((row) => `${row.school} ${row.before}→${row.after}`).join(" · ")}</p> : <p className="data-muted">Current values reproduce the published adjusted rankings.</p>}
    </section>
    <section className="rules-grid">
      {fields.map((field) => { const definition = definitionByLabel.get(field.label); return <article className="card rule-card" key={field.key}><div className="form-group"><label htmlFor={field.key}>{field.label}</label><input disabled={!canEdit} id={field.key} type="number" step={field.step} value={Number(draft[field.key])} onChange={(event) => setDraft({ ...draft, [field.key]: Number(event.target.value) })} /></div><div className="rule-copy"><h3>{definition?.application}</h3><p>{definition?.basis}</p></div></article>; })}
    </section>
  </>;
}
