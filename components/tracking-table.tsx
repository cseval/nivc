"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { responseMessage, secureFetch } from "@/lib/auth/client";
import { PaginationControls } from "@/components/pagination-controls";
import type { PageResult } from "@/lib/data/query";
import type { OutreachField, OutreachRecord, TrackingRow } from "@/lib/data/types";

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

export function TrackingTable({
  initialPage,
  conferences,
  owners
}: {
  initialPage: PageResult<TrackingRow>;
  conferences: string[];
  owners: string[];
}) {
  const [pageData, setPageData] = useState(initialPage);
  const [rows, setRows] = useState(initialPage.items);
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
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const firstRender = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);

  const loadPage = useCallback(async (page: number) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    if (watchlistOnly) params.set("watchlistOnly", "true");
    if (stage) params.set("stage", stage);
    if (owner) params.set("owner", owner);
    if (conference) params.set("conference", conference);
    if (minimumRank) params.set("minimumRank", minimumRank);
    if (maximumRank) params.set("maximumRank", maximumRank);
    if (reviewOnly) params.set("reviewOnly", "true");
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/tracking?${params}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error(await responseMessage(response, "Tracking rows could not be loaded."));
      const result = await response.json() as PageResult<TrackingRow>;
      setPageData(result);
      setRows(result.items);
      setExpanded(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(error instanceof Error ? error.message : "Tracking rows could not be loaded. Refresh the page and try again.");
    } finally {
      if (activeRequest.current === controller) setLoading(false);
    }
  }, [conference, maximumRank, minimumRank, owner, reviewOnly, search, stage, watchlistOnly]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timeout = window.setTimeout(() => void loadPage(1), 250);
    return () => window.clearTimeout(timeout);
  }, [loadPage]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function updateValue(id: string, field: OutreachField, value: string | null) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, outreach: { ...row.outreach, [field]: value } } : row
      )
    );
  }

  async function commit(id: string, field: OutreachField, value: string | null) {
    const key = `${id}:${field}`;
    setSavedCell(`${key}:saving`);
    setSaveError("");
    try {
      const response = await secureFetch(`/api/outreach/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field, value })
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The outreach change was not saved."));
      const saved = await response.json() as Pick<OutreachRecord, "updatedBy" | "updatedByName" | "updatedAt">;
      setRows((current) => current.map((row) => row.id === id
        ? { ...row, outreach: { ...row.outreach, ...saved, [field]: value } }
        : row));
      setSavedCell(`${key}:saved`);
      window.setTimeout(() => setSavedCell(""), 1400);
    } catch (error) {
      setSavedCell(`${key}:error`);
      setSaveError(error instanceof Error ? error.message : "The outreach change was not saved. Refresh the page and try again.");
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
      {saveError ? <div className="status-note status-note-error" role="alert">{saveError}</div> : null}
      {loadError ? <div className="status-note status-note-error" role="alert">{loadError}</div> : null}
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

      <div className="table-summary"><span>{loading ? "Loading filtered schools…" : `${rows.length} schools on this page`}</span><span>Editable fields save one at a time</span></div>
      <div className="table-container desktop-table" aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <th className="sticky-column">School</th><th>2025 rank</th><th>Conference</th><th>Overall</th><th>Conference W-L</th><th>Adjusted rank</th><th>Base rank</th><th>Rank change</th><th>Adjusted RPI</th><th>Base RPI</th>
              <th>Watchlist</th><th>NCAA selection</th><th>Outreach stage</th><th>Owner</th><th>Contact name</th><th>Email</th><th>Last contact</th><th>Next step</th><th>Host interest</th><th>Notes</th>
              <th>Data check</th><th>Results</th><th>D1 record</th><th>Non-D1</th><th>2025 record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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

      <div className="mobile-card-list" aria-busy={loading}>
        {rows.map((row) => (
          <article className="mobile-data-card" key={row.id}>
            <header><h2>{row.school}</h2><span className="pill">#{row.ranking?.adjustedRank ?? "—"}</span></header>
            <dl><div><dt>Conference</dt><dd>{row.standing?.conference ?? "—"}</dd></div><div><dt>Stage</dt><dd>{row.outreach.stage}</dd></div><div><dt>Owner</dt><dd>{row.outreach.owner || "Unassigned"}</dd></div></dl>
            <button className="btn btn-secondary" onClick={() => setExpanded(row.id)}>Edit outreach</button>
            {expanded === row.id ? <div className="expanded-panel"><div className="form-group"><label>Stage</label><select value={row.outreach.stage} onChange={(event) => { updateValue(row.id, "stage", event.target.value); void commit(row.id, "stage", event.target.value); }}>{STAGES.map((value) => <option key={value}>{value}</option>)}</select></div><div className="form-group"><label>Owner</label><input value={row.outreach.owner} onChange={(event) => updateValue(row.id, "owner", event.target.value)} onBlur={(event) => void commit(row.id, "owner", event.target.value)} /></div><div className="form-group"><label>Next step</label><textarea value={row.outreach.nextStep} onChange={(event) => updateValue(row.id, "nextStep", event.target.value)} onBlur={(event) => void commit(row.id, "nextStep", event.target.value)} /></div><div className="form-group"><label>Notes</label><textarea value={row.outreach.notes} onChange={(event) => updateValue(row.id, "notes", event.target.value)} onBlur={(event) => void commit(row.id, "notes", event.target.value)} /></div></div> : null}
          </article>
        ))}
      </div>
      <PaginationControls page={pageData.page} pageCount={pageData.pageCount} total={pageData.total} itemLabel="schools" loading={loading} onPageChange={(page) => void loadPage(page)} />
    </section>
  );
}
