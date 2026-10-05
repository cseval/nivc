"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { responseMessage, secureFetch } from "@/lib/auth/client";
import { PaginationControls } from "@/components/pagination-controls";
import {
  defaultTrackingSortDirection,
  type PageResult,
  type SortDirection,
  type TrackingSortKey
} from "@/lib/data/query";
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

function stageBadgeClass(stage: string): string {
  if (stage === "Complete") return "badge-success";
  if (stage === "Contacted" || stage === "Follow-up") return "badge-info";
  return "badge-warning";
}

function GroupToggle({
  expanded,
  label,
  onToggle
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="tracking-group-toggle"
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label.toLowerCase()}`}
      onClick={onToggle}
    >
      <span className="tracking-chevron" aria-hidden="true">{expanded ? "‹" : "›"}</span>
      <span>{label}</span>
    </button>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <svg
      className={`table-sort-icon${active ? ` is-${direction}` : ""}`}
      viewBox="0 0 16 20"
      aria-hidden="true"
      focusable="false"
    >
      <path className="sort-chevron-up" d="M3.5 8 8 3.5 12.5 8" />
      <path className="sort-chevron-down" d="m3.5 12 4.5 4.5 4.5-4.5" />
    </svg>
  );
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  className,
  rowSpan
}: {
  label: string;
  column: TrackingSortKey;
  activeColumn: TrackingSortKey;
  direction: SortDirection;
  onSort: (column: TrackingSortKey) => void;
  className?: string;
  rowSpan?: number;
}) {
  const active = column === activeColumn;
  const nextDirection = active
    ? (direction === "asc" ? "descending" : "ascending")
    : (defaultTrackingSortDirection(column) === "asc" ? "ascending" : "descending");
  return (
    <th
      className={`sortable-header${className ? ` ${className}` : ""}`}
      rowSpan={rowSpan}
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="table-sort-button"
        aria-label={`Sort ${label} ${nextDirection}`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <SortIcon active={active} direction={direction} />
      </button>
    </th>
  );
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
  const [sortKey, setSortKey] = useState<TrackingSortKey>("adjustedRank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [rankingExpanded, setRankingExpanded] = useState(true);
  const [crmExpanded, setCrmExpanded] = useState(false);
  const [dataCheckExpanded, setDataCheckExpanded] = useState(false);
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
    params.set("sort", sortKey);
    params.set("direction", sortDirection);
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
  }, [conference, maximumRank, minimumRank, owner, reviewOnly, search, sortDirection, sortKey, stage, watchlistOnly]);

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

  function sortBy(column: TrackingSortKey) {
    setExpanded(null);
    if (sortKey === column) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(column);
    setSortDirection(defaultTrackingSortDirection(column));
  }

  function sortableHeader(label: string, column: TrackingSortKey, className?: string, rowSpan?: number) {
    return (
      <SortableHeader
        key={column}
        label={label}
        column={column}
        activeColumn={sortKey}
        direction={sortDirection}
        onSort={sortBy}
        className={className}
        rowSpan={rowSpan}
      />
    );
  }

  const visibleColumnCount = 1
    + (rankingExpanded ? 13 : 1)
    + (crmExpanded ? 10 : 1)
    + (dataCheckExpanded ? 2 : 1);

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
        <table className="tracking-table" aria-label="Tracking table with collapsible ranking, CRM and data-check groups">
          <thead>
            <tr className="tracking-group-row">
              {sortableHeader("School", "school", "sticky-column tracking-school-column", 2)}
              <th className={`tracking-group-header tracking-ranking-group${rankingExpanded ? "" : " is-collapsed"}`} colSpan={rankingExpanded ? 13 : 1} scope="colgroup">
                <GroupToggle expanded={rankingExpanded} label="Ranking info" onToggle={() => setRankingExpanded((value) => !value)} />
              </th>
              <th className={`tracking-group-header tracking-crm-group${crmExpanded ? "" : " is-collapsed"}`} colSpan={crmExpanded ? 10 : 1} scope="colgroup">
                <GroupToggle expanded={crmExpanded} label="CRM & notes" onToggle={() => setCrmExpanded((value) => !value)} />
              </th>
              <th className={`tracking-group-header tracking-check-group${dataCheckExpanded ? "" : " is-collapsed"}`} colSpan={dataCheckExpanded ? 2 : 1} scope="colgroup">
                <GroupToggle expanded={dataCheckExpanded} label="Data check" onToggle={() => setDataCheckExpanded((value) => !value)} />
              </th>
            </tr>
            <tr className="tracking-column-row">
              {rankingExpanded ? (
                <>
                  {sortableHeader("2025 rank", "baselineRank")}
                  {sortableHeader("Conference", "conference")}
                  {sortableHeader("Overall", "overallRecord")}
                  {sortableHeader("Conference W-L", "conferenceRecord")}
                  {sortableHeader("Adjusted rank", "adjustedRank")}
                  {sortableHeader("Base rank", "baseRank")}
                  {sortableHeader("Rank change", "rankChange")}
                  {sortableHeader("Adjusted RPI", "adjustedRpi")}
                  {sortableHeader("Base RPI", "baseRpi")}
                  {sortableHeader("Results", "resultsRecord")}
                  {sortableHeader("D1 record", "d1Record")}
                  {sortableHeader("Non-D1", "nonD1Matches")}
                  {sortableHeader("2025 record", "baselineRecord")}
                </>
              ) : sortableHeader("RPI", "adjustedRpi", "tracking-ranking-summary")}
              {crmExpanded ? (
                <>
                  {sortableHeader("Watchlist", "watchlist")}
                  {sortableHeader("NCAA selection", "ncaaSelection")}
                  {sortableHeader("Outreach stage", "stage")}
                  {sortableHeader("Owner", "owner")}
                  {sortableHeader("Contact name", "contactName")}
                  {sortableHeader("Email", "email")}
                  {sortableHeader("Last contact", "lastContact")}
                  {sortableHeader("Host interest", "hostInterest")}
                  {sortableHeader("Next step", "nextStep")}
                  {sortableHeader("Notes", "notes")}
                </>
              ) : sortableHeader("CRM", "stage", "tracking-crm-summary")}
              {dataCheckExpanded
                ? <>{sortableHeader("Status", "dataCheck")}{sortableHeader("Record comparison", "recordDifference")}</>
                : sortableHeader("Check", "dataCheck", "tracking-check-summary")}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td className="sticky-column tracking-school-column"><button className="school-button" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{row.school}</button></td>
                  {rankingExpanded ? (
                    <>
                      <td className="computed-cell numeric">{row.baseline?.rank ?? "New"}</td>
                      <td className="computed-cell">{row.standing?.conference ?? "—"}</td>
                      <td className="computed-cell numeric">{row.standing ? `${row.standing.overallWins}-${row.standing.overallLosses}` : "—"}</td>
                      <td className="computed-cell numeric">{row.standing ? `${row.standing.conferenceWins}-${row.standing.conferenceLosses}` : "—"}</td>
                      <td className="computed-cell numeric">{row.ranking?.adjustedRank ?? "—"}</td>
                      <td className="computed-cell numeric">{row.ranking?.baseRank ?? "—"}</td>
                      <td className="computed-cell numeric">{rankMovement(row.ranking?.rankChange)}</td>
                      <td className="computed-cell numeric">{percent(row.ranking?.adjustedRpi)}</td>
                      <td className="computed-cell numeric">{percent(row.ranking?.baseRpi)}</td>
                      <td className="computed-cell numeric">{row.ranking ? `${row.ranking.resultsWins}-${row.ranking.resultsLosses}` : "—"}</td>
                      <td className="computed-cell numeric">{row.ranking ? `${row.ranking.d1Wins}-${row.ranking.d1Losses}` : "—"}</td>
                      <td className="computed-cell numeric">{row.ranking?.nonD1Matches ?? "—"}</td>
                      <td className="computed-cell numeric">{row.baseline?.record ?? "—"}</td>
                    </>
                  ) : <td className="computed-cell numeric rpi-summary-cell">{percent(row.ranking?.adjustedRpi)}</td>}
                  {crmExpanded ? (
                    <>
                      {selectCell(row, "watchlist", YES_NO)}
                      {selectCell(row, "ncaaSelection", SELECTION)}
                      {selectCell(row, "stage", STAGES)}
                      {inputCell(row, "owner")}
                      {inputCell(row, "contactName")}
                      {inputCell(row, "email", "email")}
                      {inputCell(row, "lastContact", "date")}
                      {selectCell(row, "hostInterest", HOST)}
                      <td className="editable-cell tracking-notes-cell" colSpan={2}>
                        <button className="btn btn-secondary btn-sm" aria-expanded={expanded === row.id} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? "Close" : "Open"}</button>
                      </td>
                    </>
                  ) : (
                    <td className="editable-cell tracking-crm-summary">
                      <div className="tracking-summary-cell">
                        <span className={`badge ${stageBadgeClass(row.outreach.stage)}`}>{row.outreach.stage}</span>
                        <button className="btn btn-secondary btn-sm" aria-expanded={expanded === row.id} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? "Close" : "Open"}</button>
                      </div>
                    </td>
                  )}
                  {dataCheckExpanded ? (
                    <>
                      <td className="computed-cell">{row.ranking?.standingsCheck === "Matches standings" ? <span className="badge badge-success">Matches standings</span> : <span className="badge badge-warning">{row.ranking?.standingsCheck ?? "Not in 2026 D1 source"}</span>}</td>
                      <td className="computed-cell data-check-comparison">{row.ranking && row.standing ? `Standings ${row.standing.overallWins}-${row.standing.overallLosses} · Ledger ${row.ranking.resultsWins}-${row.ranking.resultsLosses}` : "Comparison unavailable"}</td>
                    </>
                  ) : (
                    <td className="computed-cell data-check-summary">{row.ranking?.standingsCheck === "Matches standings" ? <span className="badge badge-success">Matches</span> : <span className="badge badge-warning">Review</span>}</td>
                  )}
                </tr>
                {expanded === row.id ? (
                  <tr className="expanded-row">
                    <td colSpan={visibleColumnCount}>
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
            <button className="btn btn-secondary" aria-expanded={expanded === row.id} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? "Close" : "Open"}</button>
            {expanded === row.id ? <div className="expanded-panel"><div className="form-group"><label>Stage</label><select value={row.outreach.stage} onChange={(event) => { updateValue(row.id, "stage", event.target.value); void commit(row.id, "stage", event.target.value); }}>{STAGES.map((value) => <option key={value}>{value}</option>)}</select></div><div className="form-group"><label>Owner</label><input value={row.outreach.owner} onChange={(event) => updateValue(row.id, "owner", event.target.value)} onBlur={(event) => void commit(row.id, "owner", event.target.value)} /></div><div className="form-group"><label>Next step</label><textarea value={row.outreach.nextStep} onChange={(event) => updateValue(row.id, "nextStep", event.target.value)} onBlur={(event) => void commit(row.id, "nextStep", event.target.value)} /></div><div className="form-group"><label>Notes</label><textarea value={row.outreach.notes} onChange={(event) => updateValue(row.id, "notes", event.target.value)} onBlur={(event) => void commit(row.id, "notes", event.target.value)} /></div></div> : null}
          </article>
        ))}
      </div>
      <PaginationControls page={pageData.page} pageCount={pageData.pageCount} total={pageData.total} itemLabel="schools" loading={loading} onPageChange={(page) => void loadPage(page)} />
    </section>
  );
}
