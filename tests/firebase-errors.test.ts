import { describe, expect, it } from "vitest";
import { isFirestoreQuotaError } from "@/lib/firebase/errors";

describe("Firestore error classification", () => {
  it("recognizes numeric and textual quota failures", () => {
    expect(isFirestoreQuotaError({ code: 8, details: "Quota exceeded." })).toBe(true);
    expect(isFirestoreQuotaError(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."))).toBe(true);
  });

  it("does not classify unrelated Firebase failures as quota errors", () => {
    expect(isFirestoreQuotaError({ code: 5, details: "Document not found." })).toBe(false);
    expect(isFirestoreQuotaError(new Error("Invalid credential."))).toBe(false);
  });
});
