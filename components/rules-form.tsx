"use client";

import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useMemo, useState } from "react";
import { useSession } from "@/components/auth-provider";
import type { RuleDefinition } from "@/lib/data/types";
import { firebaseDb } from "@/lib/firebase/client";
import { computeRankings } from "@/lib/rpi/engine";
import type { MatchInput, RankingResult, RpiRules, TeamInput } from "@/lib/rpi/types";

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
  definitions,
  teams,
  matches,
  currentRankings
}: {
  initialRules: RpiRules;
  definitions: RuleDefinition[];
  teams: TeamInput[];
  matches: MatchInput[];
  currentRankings: RankingResult[];
}) {
  const session = useSession();
  const [draft, setDraft] = useState(initialRules);
  const [savedRules, setSavedRules] = useState(initialRules);
  const [status, setStatus] = useState("");
  const definitionByLabel = useMemo(() => new Map(definitions.map((item) => [item.label, item])), [definitions]);
  const preview = useMemo(() => computeRankings({ teams, matches, rules: draft }).rankings, [teams, matches, draft]);
  const changedFields = fields.filter(({ key }) => draft[key] !== savedRules[key]);
  const moved = preview.filter((row, index) => row.adjustedRank !== currentRankings[index].adjustedRank).length;
  const biggestMoves = preview
    .map((row, index) => ({ school: row.school, before: currentRankings[index].adjustedRank, after: row.adjustedRank, movement: Math.abs((currentRankings[index].adjustedRank ?? 0) - (row.adjustedRank ?? 0)) }))
    .filter((row) => row.movement > 0)
    .sort((left, right) => right.movement - left.movement)
    .slice(0, 3);

  async function saveRules() {
    if (changedFields.length === 0 && draft.status === savedRules.status) return;
    setStatus("saving");
    try {
      if (firebaseDb && session.user) {
        await setDoc(doc(firebaseDb, "config", "rules"), { ...draft, updatedBy: session.user.uid, updatedByName: session.user.displayName ?? session.user.email, updatedAt: serverTimestamp() }, { merge: true });
        await addDoc(collection(firebaseDb, "config", "rules", "history"), { before: savedRules, after: draft, changedFields: changedFields.map((field) => field.key), updatedBy: session.user.uid, updatedByName: session.user.displayName ?? session.user.email, updatedAt: serverTimestamp() });
      } else if (typeof window !== "undefined") {
        const history = JSON.parse(window.localStorage.getItem("nivc-rules-history-preview") ?? "[]");
        history.unshift({ before: savedRules, after: draft, changedFields: changedFields.map((field) => field.key), updatedByName: "Preview user", updatedAt: new Date().toISOString() });
        window.localStorage.setItem("nivc-rules-history-preview", JSON.stringify(history));
        window.localStorage.setItem("nivc-rules-preview", JSON.stringify(draft));
      }
      setSavedRules(draft);
      setStatus("saved");
      window.setTimeout(() => setStatus(""), 1600);
    } catch {
      setStatus("error");
    }
  }

  return <>
    <section className="card">
      <div className="page-header rules-header"><div><h2>Adjustment assumptions</h2><p>Preview recomputes from the stored match ledger. Base RPI never changes.</p></div><div className="dashboard-actions"><label className="form-group"><span>Assumption check</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Ready</option><option>Draft</option><option>Review</option></select></label><button className="btn btn-primary" disabled={changedFields.length === 0 && draft.status === savedRules.status} onClick={() => void saveRules()}>Save rule changes</button></div></div>
      {draft.status !== "Ready" ? <div className="status-note status-note-warning">Adjusted RPI and adjusted rank are unavailable until the assumption check is Ready.</div> : null}
      {status === "saved" ? <div className="status-note status-note-success">Rules saved. The edit history records this change.</div> : null}
      {status === "error" ? <div className="status-note status-note-error">Rules were not saved. Check the Firebase connection and try again.</div> : null}
      <dl className="rule-preview"><div><dt>Schools moving</dt><dd>{moved}</dd></div><div><dt>Rules changed</dt><dd>{changedFields.length}</dd></div><div><dt>Largest move</dt><dd>{biggestMoves[0]?.movement ?? 0}</dd></div></dl>
      {biggestMoves.length ? <p className="data-muted">Largest preview changes: {biggestMoves.map((row) => `${row.school} ${row.before}→${row.after}`).join(" · ")}</p> : <p className="data-muted">Current values reproduce the published adjusted rankings.</p>}
    </section>
    <section className="rules-grid">
      {fields.map((field) => { const definition = definitionByLabel.get(field.label); return <article className="card rule-card" key={field.key}><div className="form-group"><label htmlFor={field.key}>{field.label}</label><input id={field.key} type="number" step={field.step} value={Number(draft[field.key])} onChange={(event) => setDraft({ ...draft, [field.key]: Number(event.target.value) })} /></div><div className="rule-copy"><h3>{definition?.application}</h3><p>{definition?.basis}</p></div></article>; })}
    </section>
  </>;
}
