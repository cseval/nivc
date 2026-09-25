import { describe, expect, it } from "vitest";
import fixtureRules from "@/fixtures/seed/rules.json";
import { parseRpiRules } from "@/lib/rpi/rules";

describe("RPI rule validation", () => {
  it("keeps only valid engine fields", () => {
    const parsed = parseRpiRules({ ...fixtureRules, updatedBy: "ignored", definitions: fixtureRules.definitions });
    expect(parsed.status).toBe("Ready");
    expect(parsed.topWinBandEnd).toBe(25);
    expect("updatedBy" in parsed).toBe(false);
    expect("definitions" in parsed).toBe(false);
  });

  it("rejects non-finite values and unsupported statuses", () => {
    expect(() => parseRpiRules({ ...fixtureRules, topWinBonus: Number.NaN })).toThrow(/topWinBonus/);
    expect(() => parseRpiRules({ ...fixtureRules, status: "Published" })).toThrow(/status/);
  });
});
