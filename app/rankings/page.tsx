import { PageHeader } from "@/components/page-header";
import { RankingsTable } from "@/components/rankings-table";
import { getMatches, getRankings } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  const [matches, rankings] = await Promise.all([getMatches(), getRankings()]);
  const topRanked = [...rankings].sort((a, b) => (a.adjustedRank ?? 9999) - (b.adjustedRank ?? 9999))[0];
  const biggestGain = [...rankings].sort((a, b) => (b.rankChange ?? 0) - (a.rankChange ?? 0))[0];
  const reviewFlags = rankings.filter((row) => row.standingsCheck !== "Matches standings").length;
  return <><PageHeader title="Rankings" description="Every workbook calculation from win percentage through adjusted rank." /><section className="stats-grid"><article className="stat-card"><h3>Adjusted number one</h3><div className="value">1</div><p>{topRanked.school}</p></article><article className="stat-card"><h3>Largest adjustment gain</h3><div className="value">+{biggestGain.rankChange}</div><p>{biggestGain.school}</p></article><article className="stat-card"><h3>Schools ranked</h3><div className="value">{rankings.length}</div><p>Complete D1 field</p></article><article className="stat-card"><h3>Review flags</h3><div className="value">{reviewFlags}</div><p>Published standings differ</p></article></section><RankingsTable rows={rankings} matches={matches} /></>;
}
