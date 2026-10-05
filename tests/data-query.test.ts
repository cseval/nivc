import { describe, expect, it } from "vitest";
import { buildTrackingRows, matches, rankings } from "@/lib/data/fixtures";
import { paginate, queryMatches, queryRankings, queryTrackingRows } from "@/lib/data/query";

describe("paged data queries", () => {
  it("clamps invalid pages and caps page size", () => {
    expect(paginate([1, 2, 3], -2, 500, 2, 2)).toEqual({
      items: [1, 2],
      page: 1,
      pageCount: 2,
      pageSize: 2,
      total: 3
    });
    expect(paginate([1, 2, 3], 99, 2)).toMatchObject({ items: [3], page: 2, pageCount: 2 });
  });

  it("filters match pages on the server and keeps the newest results first", () => {
    const result = queryMatches(matches, { division: "D1" }, 1, 25);
    expect(result.items).toHaveLength(25);
    expect(result.items.every((match) => match.division1 === "D1" && match.division2 === "D1")).toBe(true);
    expect(result.items[0].date >= result.items.at(-1)!.date).toBe(true);
    expect(result.total).toBeGreaterThan(result.items.length);
  });

  it("sorts ranking pages by adjusted rank after filtering", () => {
    const conference = rankings.find((row) => row.conference)?.conference ?? "";
    const result = queryRankings(rankings, { conference }, 1, 20);
    expect(result.items.every((row) => row.conference === conference)).toBe(true);
    expect(result.items[0].adjustedRank).toBeLessThanOrEqual(result.items.at(-1)!.adjustedRank ?? 9999);
  });

  it("combines tracking filters before paginating", () => {
    const rows = buildTrackingRows();
    const result = queryTrackingRows(rows, { watchlistOnly: true }, 1, 10);
    expect(result.items.every((row) => row.outreach.watchlist === "Yes")).toBe(true);
    expect(result.items.length).toBeLessThanOrEqual(10);
    expect(result.total).toBe(rows.filter((row) => row.outreach.watchlist === "Yes").length);
  });

  it("sorts conference standings before paginating tracking rows", () => {
    const sourceRows = buildTrackingRows().filter((row) => row.standing).slice(0, 3);
    expect(sourceRows).toHaveLength(3);
    const rows = [
      { ...sourceRows[0], school: "Middle", standing: { ...sourceRows[0].standing!, conferenceWins: 4, conferenceLosses: 2 } },
      { ...sourceRows[1], school: "Best", standing: { ...sourceRows[1].standing!, conferenceWins: 6, conferenceLosses: 0 } },
      { ...sourceRows[2], school: "Last", standing: { ...sourceRows[2].standing!, conferenceWins: 1, conferenceLosses: 5 } }
    ];
    const result = queryTrackingRows(rows, { sortKey: "conferenceRecord", sortDirection: "desc" }, 1, 2);
    expect(result.items.map((row) => row.school)).toEqual(["Best", "Middle"]);
    expect(result.total).toBe(3);
  });
});
