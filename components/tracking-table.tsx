"use client";

import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth-provider";
import type { OutreachField, OutreachRecord, TrackingRow } from "@/lib/data/types";
import { firebaseDb } from "@/lib/firebase/client";

const STAGES = ["Not started", "Researching", "Contacted", "Follow-up", "Complete"];
const YES_NO = ["No", "Yes"];
const SELECTION = ["Unknown", "Selected", "Bubble", "Not selected"];
const HOST = ["Unknown", "Interested", "Not interested", "Confirmed"];

function percent(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(6);
}

function rankMovement(value: number | null | undefined) {
  if (value == null) return <span className="data-muted">—</span>;
  if (value > 0) return <span className="rank-up">+{value}</span>;
  if (value < 0) return <span className="rank-down">{value}</span>;
  return <span className="rank-flat">0</span>;
}

function editorTitle(outreach: OutreachRecord): string {
  if (!outreach.updatedAt) return `Last edited by ${outreach.updatedByName}`;
  return `Last edited by ${outreach.updatedByName} on ${new Date(outreach.updatedAt).toLocaleString()}`;
}

function normalizeOutreach(record: OutreachRecord & { updatedAt?: unknown }): OutreachRecord {
  const value = record.updatedAt;
  const updatedAt = value && typeof value === "object" && "toDate" in value
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : typeof value === "string" ? value : null;
  return { ...record, updatedAt };
}

export function TrackingTable({ initialRows }: { initialRows: TrackingRow[] }) {
  const session = useSession();
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [stage, setStage] = useState("");
  const [owner, setOwner] = useState("");
  const [conference, setConference] = useState("");
  const [minimumRank, setMinimumRank] = useState("");
  const [maximumRank, setMaximumRank] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedCell, setSavedCell] = useState("");

  useEffect(() => {
    if (!session.preview || typeof window === "undefined") return;
    const saved = window.localStorage.getItem("nivc-outreach-preview");
    if (!saved) return;
    const patches = JSON.parse(saved) as Record<string, Partial<OutreachRecord>>;
    setRows((current) =>
      current.map((row) => ({
        ...row,
        outreach: { ...row.outreach, ...(patches[row.id] ?? {}) }
      }))
    );
  }, [session.preview]);

  useEffect(() => {
    if (!firebaseDb) return;
    return onSnapshot(collection(firebaseDb, "outreach"), (snapshot) => {
      const updates = new Map(snapshot.docs.map((item) => [item.id, normalizeOutreach(item.data() as OutreachRecord)]));
      setRows((current) =>
        current.map((row) => ({
          ...row,
          outreach: updates.has(row.id) ? { ...row.outreach, ...updates.get(row.id)! } : row.outreach
        }))
      );
    });
  }, []);

  const conferences = useMemo(
    () => Array.from(new Set(rows.map((row) => row.standing?.conference).filter(Boolean))).sort() as string[],
    [rows]
  );
  const owners = useMemo(
    () => Array.from(new Set(rows.map((row) => row.outreach.owner).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const adjustedRank = row.ranking?.adjustedRank ?? null;
      if (
        needle &&
        !`${row.school} ${row.outreach.notes} ${row.outreach.nextStep}`.toLowerCase().includes(needle)
      ) return false;
      if (watchlistOnly && row.outreach.watchlist !== "Yes") return false;
      if (stage && row.outreach.stage !== stage) return false;
      if (owner && row.outreach.owner !== owner) return false;
      if (conference && row.standing?.conference !== conference) return false;
      if (minimumRank && (adjustedRank == null || adjustedRank < Number(minimumRank))) return false;
      if (maximumRank && (adjustedRank == null || adjustedRank > Number(maximumRank))) return false;
      if (reviewOnly && row.ranking?.standingsCheck === "Matches standings") return false;
      return true;
    });
  }, [rows, search, watchlistOnly, stage, owner, conference, minimumRank, maximumRank, reviewOnly]);

  function updateValue(id: string, field: OutreachField, value: string | null) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, outreach: { ...row.outreach, [field]: value } } : row
      )
    );
  }

  async function commit(id: string, field: OutreachField, value: string | null) {
    const key = `${id}:${field}`;
    const now = new Date().toISOString();
    setSavedCell(`${key}:saving`);
    try {
      if (firebaseDb && session.user) {
        await setDoc(
          doc(firebaseDb, "outreach", id),
          {
            [field]: value,
            updatedBy: session.user.uid,
            updatedByName: session.user.displayName ?? session.user.email ?? "Team member",
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      } else if (typeof window !== "undefined") {
        const existing = JSON.parse(window.localStorage.getItem("nivc-outreach-preview") ?? "{}") as Record<
          string,
          Partial<OutreachRecord>
        >;
        existing[id] = {
          ...(existing[id] ?? {}),
          [field]: value,
          updatedBy: "preview-user",
          updatedByName: "Preview user",
          updatedAt: now
        };
        window.localStorage.setItem("nivc-outreach-preview", JSON.stringify(existing));
        setRows((current) =>
          current.map((row) =>
            row.id === id
              ? {
                  ...row,
                  outreach: {
                    ...row.outreach,
                    updatedBy: "preview-user",
                    updatedByName: "Preview user",
                    updatedAt: now
                  }
                }
              : row
          )
        );
      }
      setSavedCell(`${key}:saved`);
      window.setTimeout(() => setSavedCell(""), 1400);
    } catch {
      setSavedCell(`${key}:error`);
    }
  }

  function selectCell(row: TrackingRow, field: OutreachField, options: string[]) {
    const key = `${row.id}:${field}`;
    return (
      <td className="editable-cell" title={editorTitle(row.outreach)}>
        <select
          aria-label={`${row.school} ${field}`}
          value={String(row.outreach[field] ?? "")}
          onChange={(event) => {
            updateValue(row.id, field, event.target.value);
            void commit(row.id, field, event.target.value);
          }}
        >
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        {savedCell === `${key}:saved` ? <span className="save-indicator">Saved</span> : null}
      </td>
    );
  }

  function inputCell(row: TrackingRow, field: OutreachField, type = "text") {
    const key = `${row.id}:${field}`;
    return (
      <td className="editable-cell" title={editorTitle(row.outreach)}>
        <input
          aria-label={`${row.school} ${field}`}
          type={type}
          value={String(row.outreach[field] ?? "").slice(0, type === "date" ? 10 : undefined)}
          onChange={(event) => updateValue(row.id, field, event.target.value)}
          onBlur={(event) => void commit(row.id, field, event.target.value || null)}
        />
        {savedCell === `${key}:saved` ? <span className="save-indicator">Saved</span> : null}
      </td>
    );
  }

  function resetFilters() {
    setSearch("");
    setWatchlistOnly(false);
    setStage("");
    setOwner("");
    setConference("");
    setMinimumRank("");
    setMaximumRank("");
    setReviewOnly(false);
  }

  return (
    <section className="card">
      <div className="filters">
        <div className="form-group grow">
          <label htmlFor="tracking-search">Search school or notes</label>
          <input id="tracking-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="School, next step or note" />
        </div>
        <div className="form-group">
          <label htmlFor="stage-filter">Outreach stage</label>
          <select id="stage-filter" value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="">All stages</option>
            {STAGES.map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="owner-filter">Owner</label>
          <select id="owner-filter" value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="">All owners</option>
            {owners.map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="conference-filter">Conference</label>
          <select id="conference-filter" value={conference} onChange={(event) => setConference(event.target.value)}>
            <option value="">All conferences</option>
            {conferences.map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Adjusted rank</label>
          <div className="range-inputs">
            <input aria-label="Minimum adjusted rank" inputMode="numeric" placeholder="Min" value={minimumRank} onChange={(event) => setMinimumRank(event.target.value)} />
            <input aria-label="Maximum adjusted rank" inputMode="numeric" placeholder="Max" value={maximumRank} onChange={(event) => setMaximumRank(event.target.value)} />
          </div>
        </div>
        <label className="filter-checkbox"><input type="checkbox" checked={watchlistOnly} onChange={(event) => setWatchlistOnly(event.target.checked)} /> Watchlist only</label>
        <label className="filter-checkbox"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} /> Review flags</label>
        <button className="btn btn-secondary btn-sm" onClick={resetFilters}>Clear filters</button>
      </div>

      <div className="table-summary"><span>{filtered.length} of {rows.length} schools</span><span>Editable fields save one at a time</span></div>
      <div className="table-container desktop-table">
        <table>
          <thead>
            <tr>
              <th className="sticky-column">School</th><th>2025 rank</th><th>Conference</th><th>Overall</th><th>Conference W-L</th><th>Adjusted rank</th><th>Base rank</th><th>Rank change</th><th>Adjusted RPI</th><th>Base RPI</th>
              <th>Watchlist</th><th>NCAA selection</th><th>Outreach stage</th><th>Owner</th><th>Contact name</th><th>Email</th><th>Last contact</th><th>Next step</th><th>Host interest</th><th>Notes</th>
              <th>Data check</th><th>Results</th><th>D1 record</th><th>Non-D1</th><th>2025 record</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td className="sticky-column"><button className="school-button" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{row.school}</button></td>
                  <td className="computed-cell numeric">{row.baseline?.rank ?? "New"}</td>
                  <td className="computed-cell">{row.standing?.conference ?? "—"}</td>
                  <td className="computed-cell numeric">{row.standing ? `${row.standing.overallWins}-${row.standing.overallLosses}` : "—"}</td>
                  <td className="computed-cell numeric">{row.standing ? `${row.standing.conferenceWins}-${row.standing.conferenceLosses}` : "—"}</td>
                  <td className="computed-cell numeric">{row.ranking?.adjustedRank ?? "—"}</td>
                  <td className="computed-cell numeric">{row.ranking?.baseRank ?? "—"}</td>
                  <td className="computed-cell numeric">{rankMovement(row.ranking?.rankChange)}</td>
                  <td className="computed-cell numeric">{percent(row.ranking?.adjustedRpi)}</td>
                  <td className="computed-cell numeric">{percent(row.ranking?.baseRpi)}</td>
                  {selectCell(row, "watchlist", YES_NO)}
                  {selectCell(row, "ncaaSelection", SELECTION)}
                  {selectCell(row, "stage", STAGES)}
                  {inputCell(row, "owner")}
                  {inputCell(row, "contactName")}
                  {inputCell(row, "email", "email")}
                  {inputCell(row, "lastContact", "date")}
                  <td className="editable-cell"><button className="btn btn-secondary btn-sm" onClick={() => setExpanded(row.id)}>Open</button></td>
                  {selectCell(row, "hostInterest", HOST)}
                  <td className="editable-cell"><button className="btn btn-secondary btn-sm" onClick={() => setExpanded(row.id)}>Open</button></td>
                  <td className="computed-cell">{row.ranking?.standingsCheck === "Matches standings" ? <span className="badge badge-success">Matches standings</span> : <span className="badge badge-warning">{row.ranking?.standingsCheck ?? "Not in 2026 D1 source"}</span>}</td>
                  <td className="computed-cell numeric">{row.ranking ? `${row.ranking.resultsWins}-${row.ranking.resultsLosses}` : "—"}</td>
                  <td className="computed-cell numeric">{row.ranking ? `${row.ranking.d1Wins}-${row.ranking.d1Losses}` : "—"}</td>
                  <td className="computed-cell numeric">{row.ranking?.nonD1Matches ?? "—"}</td>
                  <td className="computed-cell numeric">{row.baseline?.record ?? "—"}</td>
                </tr>
                {expanded === row.id ? (
                  <tr className="expanded-row">
                    <td colSpan={25}>
                      <div className="expanded-panel">
                        <div className="form-group"><label htmlFor={`${row.id}-next`}>Next step</label><textarea id={`${row.id}-next`} value={row.outreach.nextStep} onChange={(event) => updateValue(row.id, "nextStep", event.target.value)} onBlur={(event) => void commit(row.id, "nextStep", event.target.value)} placeholder="Add the next outreach action" /></div>
                        <div className="form-group"><label htmlFor={`${row.id}-notes`}>Notes</label><textarea id={`${row.id}-notes`} value={row.outreach.notes} onChange={(event) => updateValue(row.id, "notes", event.target.value)} onBlur={(event) => void commit(row.id, "notes", event.target.value)} placeholder="Add selection-team context" /></div>
                        <div><h3>{row.school}</h3><p>{row.standing?.conference ?? "Not in the 2026 D1 source"}</p><p className="data-muted">Adjusted rank {row.ranking?.adjustedRank ?? "—"} · 2025 rank {row.baseline?.rank ?? "New"}</p></div>
                        <div className="expanded-panel-footer"><span>{editorTitle(row.outreach)}</span><button className="btn btn-secondary btn-sm" onClick={() => setExpanded(null)}>Close details</button></div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {filtered.map((row) => (
          <article className="mobile-data-card" key={row.id}>
            <header><h2>{row.school}</h2><span className="pill">#{row.ranking?.adjustedRank ?? "—"}</span></header>
            <dl><div><dt>Conference</dt><dd>{row.standing?.conference ?? "—"}</dd></div><div><dt>Stage</dt><dd>{row.outreach.stage}</dd></div><div><dt>Owner</dt><dd>{row.outreach.owner || "Unassigned"}</dd></div></dl>
            <button className="btn btn-secondary" onClick={() => setExpanded(row.id)}>Edit outreach</button>
            {expanded === row.id ? <div className="expanded-panel"><div className="form-group"><label>Stage</label><select value={row.outreach.stage} onChange={(event) => { updateValue(row.id, "stage", event.target.value); void commit(row.id, "stage", event.target.value); }}>{STAGES.map((value) => <option key={value}>{value}</option>)}</select></div><div className="form-group"><label>Owner</label><input value={row.outreach.owner} onChange={(event) => updateValue(row.id, "owner", event.target.value)} onBlur={(event) => void commit(row.id, "owner", event.target.value)} /></div><div className="form-group"><label>Next step</label><textarea value={row.outreach.nextStep} onChange={(event) => updateValue(row.id, "nextStep", event.target.value)} onBlur={(event) => void commit(row.id, "nextStep", event.target.value)} /></div><div className="form-group"><label>Notes</label><textarea value={row.outreach.notes} onChange={(event) => updateValue(row.id, "notes", event.target.value)} onBlur={(event) => void commit(row.id, "notes", event.target.value)} /></div></div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
