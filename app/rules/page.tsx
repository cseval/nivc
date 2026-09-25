import { PageHeader } from "@/components/page-header";
import { RulesForm } from "@/components/rules-form";
import { getRules } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const rules = await getRules();
  const { definitions, ...engineRules } = rules;
  return <><PageHeader title="RPI rules" description="Editable 2026 adjustment assumptions with a live rank preview and change history." /><RulesForm initialRules={engineRules} definitions={definitions} /></>;
}
