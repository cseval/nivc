import { PageHeader } from "@/components/page-header";
import { StandingsTable } from "@/components/standings-table";
import { getRankings, getStandings } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const [standings, rankings] = await Promise.all([getStandings(), getRankings()]);
  return <><PageHeader title="Standings" description="Conference-published records compared with the completed match ledger." /><StandingsTable standings={standings} rankings={rankings} /></>;
}
