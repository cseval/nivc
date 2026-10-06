import { describe, expect, it } from "vitest";
import { parseSidearmResults, parseSidearmStandings } from "@/lib/pipeline/parsers/sidearm";
import { localDate, parseNextSchedule, parseNextStandings } from "@/lib/pipeline/parsers/next-data";
import { parseSupplement } from "@/lib/pipeline/parsers/supplement";
import { parseSec } from "@/lib/pipeline/parsers/sec";

describe("source parsers", () => {
  it("parses Sidearm standings while ignoring responsive duplicate cells", () => {
    const html = `<table class="sidearm-standings-table"><caption>2026 Women's Volleyball</caption><thead><tr><th>School</th><th>CONFERENCE</th><th aria-hidden="true">Conf.</th><th>Ovr</th></tr></thead><tbody><tr><td>Example U.</td><td>2-1</td><td aria-hidden="true">2-1</td><td>8-2</td></tr></tbody></table>`;
    expect(parseSidearmStandings(html, { id: "example", name: "Example", url: "https://example.test/standings" })).toEqual([{ sourceName: "Example U.", conferenceId: "example", conference: "Example", overallWins: 8, overallLosses: 2, conferenceWins: 2, conferenceLosses: 1, sourceUrl: "https://example.test/standings" }]);
  });

  it("parses Sidearm results and its conference marker", () => {
    const html = `<table><caption>Overall Results</caption><tr><td>Date</td><td>Site</td><td>Result</td></tr><tr><td>08/29/2026</td><td>Home</td><td>*Alpha 3 - 1 Beta</td></tr></table>`;
    const games = parseSidearmResults(html, { id: "example", name: "Example", url: "https://example.test/results" }, (name) => name.replace(/^\*/, "").trim());
    expect(games[0]).toMatchObject({ date: "2026-08-29", school1: "Alpha", school2: "Beta", sets1: 3, sets2: 1, matchType: "Conference" });
  });

  it("parses the current SoCon Sidearm standings and results format", () => {
    const standingsHtml = `<table class="sidearm-standings-table"><caption>2026 Volleyball Standings</caption><thead><tr><th>Team</th><th>Conf</th><th>Ovr</th></tr></thead><tbody><tr><td>Wofford</td><td>2-0</td><td>9-5</td></tr></tbody></table>`;
    const resultsHtml = `<table><caption>Overall Results</caption><tr><td>Date</td><td>Site</td><td>Result</td></tr><tr><td>10/03/2026</td><td>Away</td><td>*Wofford 3 - 0 UNC Greensboro</td></tr></table>`;
    const conference = { id: "socon", name: "SoCon", url: "https://soconsports.com" };

    expect(parseSidearmStandings(standingsHtml, conference)).toEqual([
      { sourceName: "Wofford", conferenceId: "socon", conference: "SoCon", overallWins: 9, overallLosses: 5, conferenceWins: 2, conferenceLosses: 0, sourceUrl: conference.url }
    ]);
    expect(parseSidearmResults(resultsHtml, conference, (name) => name.replace(/^\*/, "").trim())[0]).toMatchObject({
      school1: "Wofford",
      school2: "UNC Greensboro",
      matchType: "Conference"
    });
  });

  it("parses Next.js standings and converts game time to the local date", () => {
    const standings = { props: { pageProps: { params: { season: 2026 }, fallback: { "x/standings/table": { data: [{ market: "Alpha", data: [{ ovr_record: "8-2" }, { conf_record: "2-1" }] }] } } } } };
    const schedule = { props: { pageProps: { params: { season: 2026 }, fallback: { 'x contentTypeUid:"schedule"': [{ results: { status: "COMPLETE", away_points: 3, home_points: 2 }, teams: { away_team: [{ market: "Alpha" }], home_team: [{ market: "Beta" }] }, datetime: { date_scheduled: "2026-09-02T01:30:00Z", timezone: "America/Denver" } }] } } } };
    const wrap = (value: unknown) => `<script id="__NEXT_DATA__">${JSON.stringify(value)}</script>`;
    expect(parseNextStandings(wrap(standings), { id: "next", name: "Next", url: "https://example.test" })[0].overallWins).toBe(8);
    expect(parseNextSchedule(wrap(schedule), { id: "next", name: "Next", url: "https://example.test" }, (name) => name)[0].date).toBe("2026-09-01");
    expect(localDate("2026-09-02T01:30:00Z", "America/Denver")).toBe("2026-09-01");
  });

  it("parses the SEC API and keeps its explicit match flag", () => {
    const events = [{ data: [{ id: 1, status: "completed", is_exhibition: false, is_conference: true, datetime: "2026-09-03T01:00:00Z", first_opponent: { name: "Alpha", school_id: 1 }, second_opponent: { name: "Beta", school_id: 2 }, first_opponent_score: 3, second_opponent_score: 0 }] }];
    const standings = { data: [{ school_id: 1, overall_wins: 8, overall_loses: 2, conference_wins: 2, conference_loses: 1 }] };
    const parsed = parseSec(events, standings, { id: "sec", name: "SEC", standingsUrl: "https://example.test" }, (name) => name);
    expect(parsed.games[0].matchType).toBe("Conference");
    expect(parsed.standings[0].sourceName).toBe("Alpha");
  });

  it("parses a team schedule supplement", () => {
    const html = `<title>2026 Volleyball Schedule</title><table class="sidearm-schedule-table"><tr><th>Date</th><th>Opponent</th><th>Time/Result</th></tr><tr><td>9/5/2026</td><td>vs. Beta</td><td>W, 3-1</td></tr></table>`;
    expect(parseSupplement(html, { team: "Alpha", url: "https://example.test", confid: "example" }, (name) => name)[0]).toMatchObject({ school1: "Alpha", school2: "Beta", sets1: 3, sets2: 1 });
  });
});
