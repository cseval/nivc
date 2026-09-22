import { PageHeader } from "@/components/page-header";
import { SchoolsTable } from "@/components/schools-table";
import { getSchoolNames } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const schoolNames = await getSchoolNames();
  return <><PageHeader title="School names" description="Reviewed source aliases and opponent division classifications." /><SchoolsTable initialRows={schoolNames} /></>;
}
