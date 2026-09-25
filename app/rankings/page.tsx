import { PageHeader } from "@/components/page-header";
import { RankingsTable } from "@/components/rankings-table";
import { getRankingsOverview } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  const overview = await getRankingsOverview();
  return <><PageHeader title="Rankings" description="Every workbook calculation from win percentage through adjusted rank." /><section className="stats-grid"><article className="stat-card"><h3>Adjusted number one</h3><div className="value">1</div><p>{overview.stats.topRanked}</p></article><article className="stat-card"><h3>Largest adjustment gain</h3><div className="value">+{overview.stats.biggestGain}</div><p>{overview.stats.biggestGainSchool}</p></article><article className="stat-card"><h3>Schools ranked</h3><div className="value">{overview.stats.total}</div><p>Complete D1 field</p></article><article className="stat-card"><h3>Review flags</h3><div className="value">{overview.stats.reviewFlags}</div><p>Published standings differ</p></article></section><RankingsTable initialPage={overview.page} conferences={overview.conferences} /></>;
}
