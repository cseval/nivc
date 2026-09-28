"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RankingResult } from "@/lib/rpi/types";
import type { StandingRecord } from "@/lib/data/types";

export function StandingsTable({
  standings,
  rankings,
  initialReviewOnly = false
}: {
  standings: StandingRecord[];
  rankings: RankingResult[];
  initialReviewOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [conference, setConference] = useState("");
  const [reviewOnly, setReviewOnly] = useState(initialReviewOnly);
  const conferences = useMemo(() => Array.from(new Set(standings.map((row) => row.conference))).sort(), [standings]);
  const rankingBySchool = useMemo(() => new Map(rankings.map((row) => [row.school, row])), [rankings]);
  const rows = standings
    .filter((row) => !search || `${row.school} ${row.sourceName}`.toLowerCase().includes(search.toLowerCase()))
    .filter((row) => !conference || row.conference === conference)
    .filter((row) => !reviewOnly || rankingBySchool.get(row.school)?.standingsCheck !== "Matches standings")
    .sort((left, right) => left.conference.localeCompare(right.conference) || left.school.localeCompare(right.school));

  return (
    <section className="card">
      {reviewOnly ? (
        <div className="status-note status-note-warning" role="status">
          A review flag means the published overall record differs from the record reconstructed from the match ledger. Open the standings source, then search the same school in <Link className="source-link" href="/matches">Match ledger</Link>. Correct the upstream source or pipeline mapping before starting another refresh.
        </div>
      ) : null}
      <div className="filters">
        <div className="form-group grow">
          <label htmlFor="standing-search">Search school</label>
          <input id="standing-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Standard or source name" />
        </div>
        <div className="form-group">
          <label htmlFor="standing-conference">Conference</label>
          <select id="standing-conference" value={conference} onChange={(event) => setConference(event.target.value)}>
            <option value="">All conferences</option>
            {conferences.map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
        <label className="filter-checkbox">
          <input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} /> Review flags
        </label>
      </div>
      <div className="table-summary"><span>{rows.length} schools</span><span>Published conference standings</span></div>
      <div className="table-container desktop-table">
        <table>
          <thead><tr><th className="sticky-column">School</th><th>Conference</th><th>Source name</th><th>Overall W-L</th><th>Conference W-L</th><th>Results W-L</th><th>Data check</th><th>Pulled</th><th>Source</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const ranking = rankingBySchool.get(row.school);
              return (
                <tr key={row.id}>
                  <td className="sticky-column">{row.school}</td>
                  <td>{row.conference}</td>
                  <td>{row.sourceName}</td>
                  <td className="numeric">{row.overallWins}-{row.overallLosses}</td>
                  <td className="numeric">{row.conferenceWins}-{row.conferenceLosses}</td>
                  <td className="numeric">{ranking?.resultsWins}-{ranking?.resultsLosses}</td>
                  <td>{ranking?.standingsCheck === "Matches standings" ? <span className="badge badge-success">Matches standings</span> : <span className="badge badge-warning">Review difference</span>}</td>
                  <td className="numeric">{row.pulledAt.slice(0, 16).replace("T", " ")}</td>
                  <td><a className="source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">Open standings</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mobile-card-list">
        {rows.map((row) => {
          const ranking = rankingBySchool.get(row.school);
          return (
            <article className="mobile-data-card" key={row.id}>
              <header><h2>{row.school}</h2><span className="pill">{row.conference}</span></header>
              <dl>
                <div><dt>Overall</dt><dd>{row.overallWins}-{row.overallLosses}</dd></div>
                <div><dt>Results</dt><dd>{ranking?.resultsWins}-{ranking?.resultsLosses}</dd></div>
                <div><dt>Check</dt><dd>{ranking?.standingsCheck === "Matches standings" ? "Matched" : "Review"}</dd></div>
              </dl>
              <a className="source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">Open standings</a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
