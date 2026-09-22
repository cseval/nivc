"use client";

import { useMemo, useState } from "react";
import type { SourceLogRecord } from "@/lib/data/types";

export function SourcesTable({ rows }: { rows: SourceLogRecord[] }) {
  const [search, setSearch] = useState("");
  const [dataType, setDataType] = useState("");
  const types = useMemo(() => Array.from(new Set(rows.map((row) => row.dataType))).sort(), [rows]);
  const filtered = rows.filter((row) => !search || `${row.name} ${row.url}`.toLowerCase().includes(search.toLowerCase())).filter((row) => !dataType || row.dataType === dataType);
  return <section className="card"><div className="filters"><div className="form-group grow"><label htmlFor="source-search">Search source</label><input id="source-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Conference, school or URL" /></div><div className="form-group"><label htmlFor="source-type">Data type</label><select id="source-type" value={dataType} onChange={(event) => setDataType(event.target.value)}><option value="">All source types</option>{types.map((value) => <option key={value}>{value}</option>)}</select></div></div><div className="table-summary"><span>{filtered.length} source requests</span><span>Last successful workbook run</span></div><div className="table-container desktop-table"><table><thead><tr><th>Name</th><th>Data type</th><th>Status</th><th>Fetched UTC</th><th>Source URL</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.dataType}</td><td><span className={row.status === "Downloaded" ? "badge badge-success" : "badge badge-warning"}>{row.status}</span></td><td className="numeric">{row.fetchedAt}</td><td><a className="source-link" href={row.url} target="_blank" rel="noreferrer">{row.url}</a></td></tr>)}</tbody></table></div><div className="mobile-card-list">{filtered.map((row) => <article className="mobile-data-card" key={row.id}><header><h2>{row.name}</h2><span className="badge badge-success">{row.status}</span></header><p>{row.dataType}</p><a className="source-link" href={row.url} target="_blank" rel="noreferrer">Open source</a></article>)}</div></section>;
}
