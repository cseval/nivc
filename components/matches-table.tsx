"use client";

import { Fragment, useMemo, useState } from "react";
import type { MatchInput } from "@/lib/rpi/types";

export function MatchesTable({ matches }: { matches: MatchInput[] }) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [matchType, setMatchType] = useState("");
  const [division, setDivision] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return matches
      .filter((match) => !needle || `${match.school1} ${match.school2}`.toLowerCase().includes(needle))
      .filter((match) => !from || match.date >= from)
      .filter((match) => !through || match.date <= through)
      .filter((match) => !matchType || match.matchType === matchType)
      .filter((match) => {
        if (!division) return true;
        if (division === "D1") return match.division1 === "D1" && match.division2 === "D1";
        return match.division1 === division || match.division2 === division;
      })
      .sort((left, right) => right.date.localeCompare(left.date) || left.school1.localeCompare(right.school1));
  }, [matches, search, from, through, matchType, division]);

  const visible = filtered.slice(0, limit);

  return (
    <section className="card">
      <div className="filters">
        <div className="form-group grow"><label htmlFor="match-search">School</label><input id="match-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search either school" /></div>
        <div className="form-group"><label htmlFor="match-from">From</label><input id="match-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
        <div className="form-group"><label htmlFor="match-through">Through</label><input id="match-through" type="date" value={through} onChange={(event) => setThrough(event.target.value)} /></div>
        <div className="form-group"><label htmlFor="match-type">Match type</label><select id="match-type" value={matchType} onChange={(event) => setMatchType(event.target.value)}><option value="">All matches</option><option>Conference</option><option>Nonconference</option></select></div>
        <div className="form-group"><label htmlFor="match-division">Division</label><select id="match-division" value={division} onChange={(event) => setDivision(event.target.value)}><option value="">All divisions</option><option>D1</option><option>D2</option><option>D3</option><option>NAIA</option></select></div>
      </div>
      <div className="table-summary"><span>Showing {visible.length} of {filtered.length} matches</span><span>Source details open below each row</span></div>
      <div className="table-container desktop-table">
        <table>
          <thead><tr><th>Date</th><th>School 1</th><th>Score</th><th>School 2</th><th>Divisions</th><th>Match type</th><th>Reports merged</th><th>Data note</th></tr></thead>
          <tbody>{visible.map((match) => <Fragment key={match.id}><tr className="clickable" onClick={() => setExpanded(expanded === match.id ? null : match.id)}><td className="numeric">{match.date}</td><td>{match.school1}</td><td className="numeric">{match.sets1}-{match.sets2}</td><td>{match.school2}</td><td><span className="pill">{match.division1} / {match.division2}</span></td><td>{match.matchType}</td><td className="numeric">{match.mergeCount ?? 1}</td><td>{match.note ? <span className="badge badge-warning">Correction</span> : <span className="data-muted">—</span>}</td></tr>{expanded === match.id ? <tr className="expanded-row"><td colSpan={8}><div className="expanded-panel"><div><h3>Source audit</h3><p>{match.typeBasis}</p>{match.note ? <p className="correction-note">{match.note}</p> : null}</div><div><h3>Raw names</h3><p>{match.rawNames?.join(" · ") || "Source names match the standard names."}</p></div><div><h3>Source URLs</h3><ul className="source-list">{match.sources?.map((url) => <li key={url}><a className="source-link" href={url} target="_blank" rel="noreferrer">Open source</a></li>)}</ul></div></div></td></tr> : null}</Fragment>)}</tbody>
        </table>
      </div>
      {visible.length < filtered.length ? <button className="btn btn-secondary" onClick={() => setLimit((value) => value + 200)}>Show 200 more matches</button> : null}
      <div className="mobile-card-list">{visible.map((match) => <article className="mobile-data-card" key={match.id}><header><h2>{match.school1}</h2><span className="pill">{match.sets1}-{match.sets2}</span></header><p>{match.school2}</p><dl><div><dt>Date</dt><dd>{match.date}</dd></div><div><dt>Type</dt><dd>{match.matchType}</dd></div><div><dt>Divisions</dt><dd>{match.division1} / {match.division2}</dd></div></dl></article>)}</div>
    </section>
  );
}
