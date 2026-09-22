import { PageHeader } from "@/components/page-header";
import { SourcesTable } from "@/components/sources-table";
import { getSourceLog } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const sourceLog = await getSourceLog();
  return <><PageHeader title="Source log" description="Every standings and results request from the latest successful refresh." /><SourcesTable rows={sourceLog} /></>;
}
