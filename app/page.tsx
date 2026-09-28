import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { RefreshBanner } from "@/components/refresh-banner";
import { TrackingTable } from "@/components/tracking-table";
import { getRefreshMetadata, getTrackingOverview } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function TrackingPage() {
  const [overview, metadata] = await Promise.all([getTrackingOverview(), getRefreshMetadata()]);

  return (
    <>
      <PageHeader title="Tracking" description="Shared rankings and outreach board for the NIVC selection team." />
      <RefreshBanner metadata={metadata} />
      <section className="stats-grid" aria-label="Tracking summary">
        <article className="stat-card"><h3>Watchlist schools</h3><div className="value">{overview.stats.watchlist}</div><p>Current team focus</p></article>
        <article className="stat-card"><h3>Active outreach</h3><div className="value">{overview.stats.activeOutreach}</div><p>Researching through follow-up</p></article>
        <article className="stat-card"><h3>Unassigned watchlist</h3><div className="value">{overview.stats.unassigned}</div><p>Needs an owner</p></article>
        <article className="stat-card"><h3>Data review flags</h3><div className="value">{metadata.standingsDiscrepancies}</div><p><Link className="source-link" href="/standings?review=1">Review standings differences</Link></p></article>
      </section>
      <TrackingTable initialPage={overview.page} conferences={overview.conferences} owners={overview.owners} />
    </>
  );
}
