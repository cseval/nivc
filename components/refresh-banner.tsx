"use client";

import { useState } from "react";
import { useSession } from "@/components/auth-provider";
import { responseMessage, secureFetch } from "@/lib/auth/client";
import type { RefreshMetadata } from "@/lib/data/types";

export function RefreshBanner({ metadata }: { metadata: RefreshMetadata }) {
  const { role } = useSession();
  const [refreshState, setRefreshState] = useState<"idle" | "starting" | "queued" | "error">("idle");
  const [refreshMessage, setRefreshMessage] = useState("");
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

  async function startRefresh() {
    setRefreshState("starting");
    setRefreshMessage("");
    try {
      const response = await secureFetch("/api/admin/rerun", { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response, "The data refresh could not be started."));
      setRefreshState("queued");
      setRefreshMessage("Refresh queued. New data will publish after every validation check passes.");
    } catch (error) {
      setRefreshState("error");
      setRefreshMessage(error instanceof Error ? error.message : "The data refresh could not be started. Reload the page and try again.");
    }
  }

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
      <div className="refresh-banner-side">
        <p className="estimate-warning">Unofficial estimate. The 2026 NCAA adjustment amounts are not confirmed.</p>
        {role === "admin" ? (
          <div className="refresh-control">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={refreshState === "starting" || refreshState === "queued"}
              onClick={() => void startRefresh()}
            >
              {refreshState === "starting" ? "Starting refresh…" : refreshState === "queued" ? "Refresh queued" : "Refresh data"}
            </button>
            {refreshMessage ? (
              <div
                className={`status-note ${refreshState === "error" ? "status-note-error" : "status-note-success"}`}
                role={refreshState === "error" ? "alert" : "status"}
              >
                {refreshMessage}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
