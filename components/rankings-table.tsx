"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { responseMessage } from "@/lib/auth/client";
import { PaginationControls } from "@/components/pagination-controls";
import type { PageResult, SchoolScheduleRow } from "@/lib/data/query";
import type { RankingResult } from "@/lib/rpi/types";

const columns: Array<{ key: keyof RankingResult; label: string; digits?: number }> = [
  { key: "conference", label: "Conference" },
  { key: "standingsWins", label: "Standings W" },
  { key: "standingsLosses", label: "Standings L" },
  { key: "resultsWins", label: "Results W" },
  { key: "resultsLosses", label: "Results L" },
  { key: "nonD1Matches", label: "Non-D1" },
  { key: "d1Wins", label: "D1 W" },
  { key: "d1Losses", label: "D1 L" },
  { key: "winPercentage", label: "WP", digits: 6 },
  { key: "opponentWinPercentage", label: "OWP", digits: 6 },
  { key: "opponentsOpponentPercentage", label: "OOWP", digits: 6 },
  { key: "baseRpi", label: "Base RPI", digits: 12 },
  { key: "baseRank", label: "Base rank" },
  { key: "standingsCheck", label: "Standings check" },
  { key: "topBandWins", label: "Top-band wins" },
  { key: "secondBandWins", label: "Second-band wins" },
  { key: "firstBandLosses", label: "First-band losses" },
  { key: "severeLosses", label: "Severe losses" },
  { key: "nonconferenceMatches", label: "Nonconference" },
  { key: "strongNonconferenceMatches", label: "Strong nonconf" },
  { key: "weakNonconferenceMatches", label: "Weak nonconf" },
  { key: "strongNonconferenceShare", label: "Strong share", digits: 4 },
  { key: "weakNonconferenceShare", label: "Weak share", digits: 4 },
  { key: "winBonuses", label: "Win bonuses", digits: 4 },
  { key: "lossPenalties", label: "Loss penalties", digits: 4 },
  { key: "scheduleBonus", label: "Schedule bonus", digits: 4 },
  { key: "schedulePenalty", label: "Schedule penalty", digits: 4 },
  { key: "netAdjustment", label: "Net adjustment", digits: 4 },
  { key: "adjustedRpi", label: "Adjusted RPI", digits: 12 },
  { key: "adjustedRank", label: "Adjusted rank" },
  { key: "rankChange", label: "Rank change" }
];

function display(value: unknown, digits?: number): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number" && digits != null) return value.toFixed(digits);
  return String(value);
}

export function RankingsTable({ initialPage, conferences }: { initialPage: PageResult<RankingResult>; conferences: string[] }) {
  const [pageData, setPageData] = useState(initialPage);
  const [search, setSearch] = useState("");
  const [conference, setConference] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Record<string, SchoolScheduleRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState("");
  const [loadError, setLoadError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const firstRender = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);

  const loadPage = useCallback(async (page: number) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    if (conference) params.set("conference", conference);
    if (reviewOnly) params.set("reviewOnly", "true");
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/rankings?${params}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error(await responseMessage(response, "Rankings could not be loaded."));
      setPageData(await response.json() as PageResult<RankingResult>);
      setExpanded(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(error instanceof Error ? error.message : "Rankings could not be loaded. Refresh the page and try again.");
    } finally {
      if (activeRequest.current === controller) setLoading(false);
    }
  }, [conference, reviewOnly, search]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timeout = window.setTimeout(() => void loadPage(1), 250);
    return () => window.clearTimeout(timeout);
  }, [loadPage]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function toggleSchedule(school: string) {
    if (expanded === school) {
      setExpanded(null);
      return;
    }
    setExpanded(school);
    setScheduleError("");
    if (schedules[school]) return;
    setLoadingSchedule(school);
    try {
      const response = await fetch(`/api/rankings/schedule?school=${encodeURIComponent(school)}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(await responseMessage(response, "The school schedule could not be loaded."));
      const body = await response.json() as { schedule: SchoolScheduleRow[] };
      setSchedules((current) => ({ ...current, [school]: body.schedule }));
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "The school schedule could not be loaded. Close the row and try again.");
    } finally {
      setLoadingSchedule("");
    }
  }

  return (
    <section className="card">
      <div className="filters">
        <div className="form-group grow"><label htmlFor="ranking-search">Search school</label><input id="ranking-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="School name" /></div>
        <div className="form-group"><label htmlFor="ranking-conference">Conference</label><select id="ranking-conference" value={conference} onChange={(event) => setConference(event.target.value)}><option value="">All conferences</option>{conferences.map((value) => <option key={value}>{value}</option>)}</select></div>
        <label className="filter-checkbox"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} /> Review flags</label>
      </div>
      {loadError ? <div className="status-note status-note-error" role="alert">{loadError}</div> : null}
      <div className="table-summary"><span>{loading ? "Loading filtered rankings…" : `${pageData.items.length} schools on this page`}</span><span>Select a school to load its D1 schedule</span></div>
      <div className="table-container desktop-table" aria-busy={loading}>
        <table>
          <thead><tr><th className="sticky-column">School</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {pageData.items.map((row) => (
              <Fragment key={row.school}>
                <tr>
                  <td className="sticky-column"><button className="school-button" aria-expanded={expanded === row.school} onClick={() => void toggleSchedule(row.school)}>{row.school}</button></td>
                  {columns.map((column) => {
                    const value = row[column.key];
                    const status = column.key === "standingsCheck";
                    return <td key={column.key} className={typeof value === "number" ? "numeric" : undefined}>{status ? (value === "Matches standings" ? <span className="badge badge-success">Matches standings</span> : <span className="badge badge-warning">Review difference</span>) : display(value, column.digits)}</td>;
                  })}
                </tr>
                {expanded === row.school ? (
                  <tr className="expanded-row"><td colSpan={32}><div className="expanded-panel schedule-panel"><div><h3>{row.school} D1 schedule</h3><p className="data-muted">Opponent rank uses the unadjusted base rank.</p></div>{loadingSchedule === row.school ? <div className="loading compact-loading">Loading {row.school}&apos;s schedule…</div> : scheduleError ? <div className="status-note status-note-error" role="alert">{scheduleError}</div> : <div className="table-container schedule-table"><table><thead><tr><th>Date</th><th>Opponent</th><th>Opponent base rank</th><th>Result</th><th>Match type</th></tr></thead><tbody>{(schedules[row.school] ?? []).map((match) => <tr key={match.id}><td className="numeric">{match.date}</td><td>{match.opponent}</td><td className="numeric">{match.opponentRank ?? "—"}</td><td><span className={match.won ? "badge badge-success" : "badge badge-danger"}>{match.won ? "Win" : "Loss"}</span> {match.score}</td><td>{match.matchType}</td></tr>)}</tbody></table></div>}</div></td></tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-card-list" aria-busy={loading}>{pageData.items.map((row) => <article className="mobile-data-card" key={row.school}><header><h2>{row.school}</h2><span className="pill">#{row.adjustedRank}</span></header><dl><div><dt>Base rank</dt><dd>{row.baseRank}</dd></div><div><dt>Adjusted RPI</dt><dd className="numeric">{row.adjustedRpi?.toFixed(6)}</dd></div><div><dt>Change</dt><dd>{row.rankChange && row.rankChange > 0 ? `+${row.rankChange}` : row.rankChange}</dd></div></dl></article>)}</div>
      <PaginationControls page={pageData.page} pageCount={pageData.pageCount} total={pageData.total} itemLabel="schools" loading={loading} onPageChange={(page) => void loadPage(page)} />
    </section>
  );
}
