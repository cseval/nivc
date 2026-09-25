"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { responseMessage } from "@/lib/auth/client";
import { PaginationControls } from "@/components/pagination-controls";
import type { PageResult } from "@/lib/data/query";
import type { MatchInput } from "@/lib/rpi/types";

export function MatchesTable({ initialPage }: { initialPage: PageResult<MatchInput> }) {
  const [pageData, setPageData] = useState(initialPage);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [matchType, setMatchType] = useState("");
  const [division, setDivision] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
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
    if (from) params.set("from", from);
    if (through) params.set("through", through);
    if (matchType) params.set("matchType", matchType);
    if (division) params.set("division", division);
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/matches?${params}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error(await responseMessage(response, "Matches could not be loaded."));
      setPageData(await response.json() as PageResult<MatchInput>);
      setExpanded(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(error instanceof Error ? error.message : "Matches could not be loaded. Refresh the page and try again.");
    } finally {
      if (activeRequest.current === controller) setLoading(false);
    }
  }, [division, from, matchType, search, through]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timeout = window.setTimeout(() => void loadPage(1), 250);
    return () => window.clearTimeout(timeout);
  }, [loadPage]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  return (
    <section className="card">
      <div className="filters">
        <div className="form-group grow"><label htmlFor="match-search">School</label><input id="match-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search either school" /></div>
        <div className="form-group"><label htmlFor="match-from">From</label><input id="match-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
        <div className="form-group"><label htmlFor="match-through">Through</label><input id="match-through" type="date" value={through} onChange={(event) => setThrough(event.target.value)} /></div>
        <div className="form-group"><label htmlFor="match-type">Match type</label><select id="match-type" value={matchType} onChange={(event) => setMatchType(event.target.value)}><option value="">All matches</option><option>Conference</option><option>Nonconference</option></select></div>
        <div className="form-group"><label htmlFor="match-division">Division</label><select id="match-division" value={division} onChange={(event) => setDivision(event.target.value)}><option value="">All divisions</option><option>D1</option><option>D2</option><option>D3</option><option>NAIA</option></select></div>
      </div>
      {loadError ? <div className="status-note status-note-error" role="alert">{loadError}</div> : null}
      <div className="table-summary"><span>{loading ? "Loading filtered matches…" : `Showing ${pageData.items.length} matches`}</span><span>Source details open below each row</span></div>
      <div className="table-container desktop-table" aria-busy={loading}>
        <table>
          <thead><tr><th>Date</th><th>School 1</th><th>Score</th><th>School 2</th><th>Divisions</th><th>Match type</th><th>Reports merged</th><th>Data note</th></tr></thead>
          <tbody>{pageData.items.map((match) => <Fragment key={match.id}><tr className="clickable" onClick={() => setExpanded(expanded === match.id ? null : match.id)}><td className="numeric">{match.date}</td><td>{match.school1}</td><td className="numeric">{match.sets1}-{match.sets2}</td><td>{match.school2}</td><td><span className="pill">{match.division1} / {match.division2}</span></td><td>{match.matchType}</td><td className="numeric">{match.mergeCount ?? 1}</td><td>{match.note ? <span className="badge badge-warning">Correction</span> : <span className="data-muted">—</span>}</td></tr>{expanded === match.id ? <tr className="expanded-row"><td colSpan={8}><div className="expanded-panel"><div><h3>Source audit</h3><p>{match.typeBasis}</p>{match.note ? <p className="correction-note">{match.note}</p> : null}</div><div><h3>Raw names</h3><p>{match.rawNames?.join(" · ") || "Source names match the standard names."}</p></div><div><h3>Source URLs</h3><ul className="source-list">{match.sources?.map((url) => <li key={url}><a className="source-link" href={url} target="_blank" rel="noreferrer">Open source</a></li>)}</ul></div></div></td></tr> : null}</Fragment>)}</tbody>
        </table>
      </div>
      <div className="mobile-card-list" aria-busy={loading}>{pageData.items.map((match) => <article className="mobile-data-card" key={match.id}><header><h2>{match.school1}</h2><span className="pill">{match.sets1}-{match.sets2}</span></header><p>{match.school2}</p><dl><div><dt>Date</dt><dd>{match.date}</dd></div><div><dt>Type</dt><dd>{match.matchType}</dd></div><div><dt>Divisions</dt><dd>{match.division1} / {match.division2}</dd></div></dl></article>)}</div>
      <PaginationControls page={pageData.page} pageCount={pageData.pageCount} total={pageData.total} itemLabel="matches" loading={loading} onPageChange={(page) => void loadPage(page)} />
    </section>
  );
}
