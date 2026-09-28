"use client";

import { useState } from "react";
import { useSession } from "@/components/auth-provider";
import { responseMessage, secureFetch } from "@/lib/auth/client";
import type { RefreshMetadata } from "@/lib/data/types";

export function RefreshBanner({ metadata }: { metadata: RefreshMetadata }) {
  const { role } = useSession();
  const [refreshState, setRefreshState] = useState<"idle" | "starting" | "running" | "succeeded" | "error">("idle");
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

  async function monitorRefresh(runId: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      const response = await fetch(`/api/admin/rerun/${encodeURIComponent(runId)}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(await responseMessage(response, "Refresh status could not be loaded."));
      const run = await response.json() as {
        status: string;
        fetchedTaskCount: number;
        throughGames: string | null;
        error: string | null;
      };
      if (run.status === "failed") {
        throw new Error(`Refresh stopped: ${run.error ?? "The pipeline failed without an error message."} The last validated dataset remains published.`);
      }
      if (run.status === "succeeded") {
        setRefreshState("succeeded");
        setRefreshMessage(`Refresh complete${run.throughGames ? ` through ${run.throughGames}` : ""}. Reloading the published data…`);
        window.setTimeout(() => window.location.reload(), 1_200);
        return;
      }
      if (run.status === "fetching") {
        setRefreshMessage(`Downloading current source data${run.fetchedTaskCount ? ` — ${run.fetchedTaskCount} source groups saved` : ""}…`);
      } else if (run.status === "parsing" || run.status === "parsed") {
        setRefreshMessage("Reconciling and deduplicating downloaded records…");
      } else if (run.status === "computing") {
        setRefreshMessage("Validation passed. Computing and publishing rankings…");
      } else {
        setRefreshMessage("Refresh queued. Waiting for the source pipeline to start…");
      }
    }
    setRefreshMessage("The refresh is still running. Reload this page later to see the latest published data.");
  }

  async function startRefresh() {
    setRefreshState("starting");
    setRefreshMessage("");
    try {
      const response = await secureFetch("/api/admin/rerun", { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response, "The data refresh could not be started."));
      const body = await response.json() as { runId?: string };
      if (!body.runId) throw new Error("The refresh started without a run ID. Reload the page and check the publication time.");
      setRefreshState("running");
      setRefreshMessage("Refresh started. Downloading current conference data…");
      await monitorRefresh(body.runId);
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
              disabled={refreshState === "starting" || refreshState === "running" || refreshState === "succeeded"}
              onClick={() => void startRefresh()}
            >
              {refreshState === "starting" ? "Starting refresh…" : refreshState === "running" ? "Refreshing data…" : refreshState === "succeeded" ? "Refresh complete" : "Refresh data"}
            </button>
            {refreshMessage ? (
              <div
                className={`status-note ${refreshState === "error" ? "status-note-error" : refreshState === "succeeded" ? "status-note-success" : "status-note-warning"}`}
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
