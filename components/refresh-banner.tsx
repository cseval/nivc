import type { RefreshMetadata } from "@/lib/data/types";

export function RefreshBanner({ metadata }: { metadata: RefreshMetadata }) {
  const refreshInstant = /(?:Z|[+-]\d{2}:\d{2})$/.test(metadata.lastSuccessfulRefresh)
    ? metadata.lastSuccessfulRefresh
    : `${metadata.lastSuccessfulRefresh}Z`;
  const refreshed = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Denver",
    timeZoneName: "short"
  }).format(new Date(refreshInstant));

  return (
    <section className="refresh-banner" aria-label="Dataset status">
      <div className="refresh-banner-main">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <strong>Current through {metadata.throughGames}</strong>
          <span>Last successful refresh {refreshed}</span>
        </div>
      </div>
      <dl className="refresh-facts">
        <div><dt>Schools</dt><dd>{metadata.schoolCount}</dd></div>
        <div><dt>Matches</dt><dd>{metadata.matchCount.toLocaleString()}</dd></div>
        <div><dt>Review flags</dt><dd>{metadata.standingsDiscrepancies}</dd></div>
      </dl>
      <p className="estimate-warning">Unofficial estimate. The 2026 NCAA adjustment amounts are not confirmed.</p>
    </section>
  );
}
