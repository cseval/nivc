import { describe, expect, it } from "vitest";
import { decodeRawPayload, encodeRawPayload } from "@/lib/pipeline/raw-payload";

describe("raw pipeline payload storage", () => {
  it("keeps small payloads inline", () => {
    const encoded = encodeRawPayload("small source response");
    expect(encoded.chunks).toEqual([]);
    expect(decodeRawPayload(encoded.document, encoded.chunks)).toBe("small source response");
  });

  it("compresses and chunks payloads that exceed the inline limit", () => {
    const payload = "conference schedule ✅\n".repeat(10_000);
    const encoded = encodeRawPayload(payload, { inlineLimitBytes: 0, chunkSizeCharacters: 40 });
    expect(encoded.chunks.length).toBeGreaterThan(1);
    expect(encoded.chunks.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(decodeRawPayload(encoded.document, encoded.chunks)).toBe(payload);
  });

  it("rejects incomplete chunk sets", () => {
    const encoded = encodeRawPayload("large response".repeat(1_000), { inlineLimitBytes: 0, chunkSizeCharacters: 40 });
    expect(() => decodeRawPayload(encoded.document, encoded.chunks.slice(1))).toThrow(/incomplete/);
  });
});
