import { MatchesTable } from "@/components/matches-table";
import { PageHeader } from "@/components/page-header";
import { getMatches } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const matches = await getMatches();
  const d1 = matches.filter((match) => match.division1 === "D1" && match.division2 === "D1").length;
  const duplicateReports = matches.reduce((sum, match) => sum + Math.max(0, (match.mergeCount ?? 1) - 1), 0);
  const corrections = matches.filter((match) => match.note).length;
  return <><PageHeader title="Matches" description="Deduplicated results with source, classification and correction evidence." /><section className="stats-grid"><article className="stat-card"><h3>Unique matches</h3><div className="value">{matches.length.toLocaleString()}</div><p>Composite-key deduplicated</p></article><article className="stat-card"><h3>D1 matches</h3><div className="value">{d1.toLocaleString()}</div><p>Included in base RPI</p></article><article className="stat-card"><h3>Duplicate reports merged</h3><div className="value">{duplicateReports.toLocaleString()}</div><p>Audit sources retained</p></article><article className="stat-card"><h3>Reviewed corrections</h3><div className="value">{corrections}</div><p>Evidence retained with match</p></article></section><MatchesTable matches={matches} /></>;
}
