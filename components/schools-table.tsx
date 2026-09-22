"use client";

import { doc, setDoc } from "firebase/firestore";
import { useMemo, useState } from "react";
import { useSession } from "@/components/auth-provider";
import type { SchoolNameRecord } from "@/lib/data/types";
import { firebaseDb } from "@/lib/firebase/client";

export function SchoolsTable({ initialRows }: { initialRows: SchoolNameRecord[] }) {
  const { role, preview } = useSession();
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("");
  const [saved, setSaved] = useState("");
  const canEdit = role === "admin";
  const divisions = useMemo(() => Array.from(new Set(rows.map((row) => row.division))).sort(), [rows]);
  const filtered = rows.filter((row) => !search || `${row.sourceName} ${row.standardName}`.toLowerCase().includes(search.toLowerCase())).filter((row) => !division || row.division === division);

  function update(id: string, field: "standardName" | "division", value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  async function save(row: SchoolNameRecord) {
    if (!canEdit) return;
    if (firebaseDb) await setDoc(doc(firebaseDb, "schoolNames", row.id), row, { merge: true });
    if (preview && typeof window !== "undefined") {
      const existing = JSON.parse(window.localStorage.getItem("nivc-alias-preview") ?? "{}");
      existing[row.id] = row;
      window.localStorage.setItem("nivc-alias-preview", JSON.stringify(existing));
    }
    setSaved(row.id);
    window.setTimeout(() => setSaved(""), 1200);
  }

  return <section className="card"><div className="filters"><div className="form-group grow"><label htmlFor="school-search">Search alias</label><input id="school-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Source or standard name" /></div><div className="form-group"><label htmlFor="division-filter">Division</label><select id="division-filter" value={division} onChange={(event) => setDivision(event.target.value)}><option value="">All divisions</option>{divisions.map((value) => <option key={value}>{value}</option>)}</select></div></div>{!canEdit ? <div className="status-note status-note-warning">Alias changes require an admin account.</div> : null}<div className="table-summary"><span>{filtered.length} aliases</span><span>{canEdit ? "Changes save on blur" : "Read only"}</span></div><div className="table-container desktop-table"><table><thead><tr><th>Source name</th><th>Standard school name</th><th>Division</th><th>Seen in</th><th>Matching note</th><th>Status</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td>{row.sourceName}</td><td className={canEdit ? "editable-cell" : undefined}><input disabled={!canEdit} value={row.standardName} onChange={(event) => update(row.id, "standardName", event.target.value)} onBlur={() => void save(row)} /></td><td className={canEdit ? "editable-cell" : undefined}><select disabled={!canEdit} value={row.division} onChange={(event) => { update(row.id, "division", event.target.value); void save({ ...row, division: event.target.value }); }}><option>D1</option><option>D2</option><option>D3</option><option>NAIA</option></select></td><td>{row.seenIn}</td><td>{row.matchingNote}</td><td>{saved === row.id ? <span className="badge badge-success">Saved</span> : ""}</td></tr>)}</tbody></table></div><div className="mobile-card-list">{filtered.map((row) => <article className="mobile-data-card" key={row.id}><header><h2>{row.sourceName}</h2><span className="pill">{row.division}</span></header><p>{row.standardName}</p><p className="data-muted">{row.matchingNote}</p></article>)}</div></section>;
}
