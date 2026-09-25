import { MatchesTable } from "@/components/matches-table";
import { PageHeader } from "@/components/page-header";
import { getMatchesOverview } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const overview = await getMatchesOverview();
  return <><PageHeader title="Matches" description="Deduplicated results with source, classification and correction evidence." /><section className="stats-grid"><article className="stat-card"><h3>Unique matches</h3><div className="value">{overview.stats.total.toLocaleString()}</div><p>Composite-key deduplicated</p></article><article className="stat-card"><h3>D1 matches</h3><div className="value">{overview.stats.d1.toLocaleString()}</div><p>Included in base RPI</p></article><article className="stat-card"><h3>Duplicate reports merged</h3><div className="value">{overview.stats.duplicateReports.toLocaleString()}</div><p>Audit sources retained</p></article><article className="stat-card"><h3>Reviewed corrections</h3><div className="value">{overview.stats.corrections}</div><p>Evidence retained with match</p></article></section><MatchesTable initialPage={overview.page} /></>;
}
