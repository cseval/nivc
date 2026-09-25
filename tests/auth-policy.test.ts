import { describe, expect, it } from "vitest";
import { isAllowedEmail, normalizeEmail, safeReturnPath } from "@/lib/auth/policy";

describe("authentication policy", () => {
  it("normalizes and permits only exact Triple Crown Sports addresses", () => {
    expect(normalizeEmail("  Person@TripleCrownSports.com ")).toBe("person@triplecrownsports.com");
    expect(isAllowedEmail("Person@TripleCrownSports.com")).toBe(true);
    expect(isAllowedEmail("person@sub.triplecrownsports.com")).toBe(false);
    expect(isAllowedEmail("person@triplecrownsports.com.attacker.test")).toBe(false);
    expect(isAllowedEmail("@triplecrownsports.com")).toBe(false);
  });

  it("allows only local post-login return paths", () => {
    expect(safeReturnPath("/rankings?view=top")).toBe("/rankings?view=top");
    expect(safeReturnPath("https://attacker.test")).toBe("/");
    expect(safeReturnPath("//attacker.test/path")).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
  });
});
