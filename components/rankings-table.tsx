"use client";

import { Fragment, useMemo, useState } from "react";
import type { MatchInput, RankingResult } from "@/lib/rpi/types";

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

export function RankingsTable({ rows, matches }: { rows: RankingResult[]; matches: MatchInput[] }) {
  const [search, setSearch] = useState("");
  const [conference, setConference] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const conferences = useMemo(() => Array.from(new Set(rows.map((row) => row.conference))).sort(), [rows]);
  const rankBySchool = useMemo(() => new Map(rows.map((row) => [row.school, row.baseRank])), [rows]);
  const filtered = rows
    .filter((row) => !search || row.school.toLowerCase().includes(search.toLowerCase()))
    .filter((row) => !conference || row.conference === conference)
    .filter((row) => !reviewOnly || row.standingsCheck !== "Matches standings")
    .sort((left, right) => (left.adjustedRank ?? 9999) - (right.adjustedRank ?? 9999));

  function schoolMatches(school: string) {
    return matches
      .filter((match) =>
        match.division1 === "D1" &&
        match.division2 === "D1" &&
        (match.school1 === school || match.school2 === school)
      )
      .map((match) => {
        const schoolIsFirst = match.school1 === school;
        const opponent = schoolIsFirst ? match.school2 : match.school1;
        const won = schoolIsFirst ? match.sets1 > match.sets2 : match.sets2 > match.sets1;
        return { match, opponent, opponentRank: rankBySchool.get(opponent), won };
      })
      .sort((left, right) => left.match.date.localeCompare(right.match.date));
  }

  return (
    <section className="card">
      <div className="filters">
        <div className="form-group grow"><label htmlFor="ranking-search">Search school</label><input id="ranking-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="School name" /></div>
        <div className="form-group"><label htmlFor="ranking-conference">Conference</label><select id="ranking-conference" value={conference} onChange={(event) => setConference(event.target.value)}><option value="">All conferences</option>{conferences.map((value) => <option key={value}>{value}</option>)}</select></div>
        <label className="filter-checkbox"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} /> Review flags</label>
      </div>
      <div className="table-summary"><span>{filtered.length} schools</span><span>Select a school to inspect its D1 schedule</span></div>
      <div className="table-container desktop-table">
        <table>
          <thead><tr><th className="sticky-column">School</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {filtered.map((row) => (
              <Fragment key={row.school}>
                <tr className="clickable" onClick={() => setExpanded(expanded === row.school ? null : row.school)}>
                  <td className="sticky-column"><button className="school-button">{row.school}</button></td>
                  {columns.map((column) => {
                    const value = row[column.key];
                    const status = column.key === "standingsCheck";
                    return <td key={column.key} className={typeof value === "number" ? "numeric" : undefined}>{status ? (value === "Matches standings" ? <span className="badge badge-success">Matches standings</span> : <span className="badge badge-warning">Review difference</span>) : display(value, column.digits)}</td>;
                  })}
                </tr>
                {expanded === row.school ? (
                  <tr className="expanded-row"><td colSpan={32}><div className="expanded-panel"><div><h3>{row.school} D1 schedule</h3><p className="data-muted">Opponent rank uses the unadjusted base rank.</p></div><div className="table-container" style={{ gridColumn: "1 / -1", maxHeight: 320 }}><table><thead><tr><th>Date</th><th>Opponent</th><th>Opponent base rank</th><th>Result</th><th>Match type</th></tr></thead><tbody>{schoolMatches(row.school).map(({ match, opponent, opponentRank, won }) => <tr key={match.id}><td className="numeric">{match.date}</td><td>{opponent}</td><td className="numeric">{opponentRank ?? "—"}</td><td><span className={won ? "badge badge-success" : "badge badge-danger"}>{won ? "Win" : "Loss"}</span> {match.school1 === row.school ? `${match.sets1}-${match.sets2}` : `${match.sets2}-${match.sets1}`}</td><td>{match.matchType}</td></tr>)}</tbody></table></div></div></td></tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-card-list">{filtered.map((row) => <article className="mobile-data-card" key={row.school}><header><h2>{row.school}</h2><span className="pill">#{row.adjustedRank}</span></header><dl><div><dt>Base rank</dt><dd>{row.baseRank}</dd></div><div><dt>Adjusted RPI</dt><dd className="numeric">{row.adjustedRpi?.toFixed(6)}</dd></div><div><dt>Change</dt><dd>{row.rankChange && row.rankChange > 0 ? `+${row.rankChange}` : row.rankChange}</dd></div></dl></article>)}</div>
    </section>
  );
}
