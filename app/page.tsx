import { PageHeader } from "@/components/page-header";
import { RefreshBanner } from "@/components/refresh-banner";
import { TrackingTable } from "@/components/tracking-table";
import { getRefreshMetadata, getTrackingRows } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function TrackingPage() {
  const [rows, metadata] = await Promise.all([getTrackingRows(), getRefreshMetadata()]);
  const watchlist = rows.filter((row) => row.outreach.watchlist === "Yes").length;
  const activeOutreach = rows.filter((row) => !["Not started", "Complete"].includes(row.outreach.stage)).length;
  const unassigned = rows.filter((row) => row.outreach.watchlist === "Yes" && !row.outreach.owner).length;

  return (
    <>
      <PageHeader title="Tracking" description="Shared rankings and outreach board for the NIVC selection team." />
      <RefreshBanner metadata={metadata} />
      <section className="stats-grid" aria-label="Tracking summary">
        <article className="stat-card"><h3>Watchlist schools</h3><div className="value">{watchlist}</div><p>Current team focus</p></article>
        <article className="stat-card"><h3>Active outreach</h3><div className="value">{activeOutreach}</div><p>Researching through follow-up</p></article>
        <article className="stat-card"><h3>Unassigned watchlist</h3><div className="value">{unassigned}</div><p>Needs an owner</p></article>
        <article className="stat-card"><h3>Data review flags</h3><div className="value">{metadata.standingsDiscrepancies}</div><p>Verified standings differences</p></article>
      </section>
      <TrackingTable initialRows={rows} />
    </>
  );
}
