import { PageHeader } from "@/components/page-header";
import { RulesForm } from "@/components/rules-form";
import { getMatches, getRankings, getRules, getStandings } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [matches, rankings, rules, standings] = await Promise.all([getMatches(), getRankings(), getRules(), getStandings()]);
  const teams = standings.map((standing) => ({ school: standing.school, conference: standing.conference, standingsWins: standing.overallWins, standingsLosses: standing.overallLosses }));
  const { definitions, ...engineRules } = rules;
  return <><PageHeader title="RPI rules" description="Editable 2026 adjustment assumptions with a live rank preview and change history." /><RulesForm initialRules={engineRules} definitions={definitions} teams={teams} matches={matches} currentRankings={rankings} /></>;
}
