import { gzipSync, gunzipSync } from "node:zlib";
import { getAdminDb } from "@/lib/firebase/admin";
import type { StoredPayload } from "@/lib/pipeline/parse-run";

const INLINE_LIMIT_BYTES = 700_000;
const CHUNK_SIZE_CHARACTERS = 700_000;
const MAX_CHUNKS_PER_PAYLOAD = 400;

type EncodedRawPayload = {
  document: Record<string, unknown>;
  chunks: string[];
};

export function encodeRawPayload(
  payload: string,
  options: { inlineLimitBytes?: number; chunkSizeCharacters?: number } = {}
): EncodedRawPayload {
  const byteLength = Buffer.byteLength(payload, "utf8");
  const inlineLimit = options.inlineLimitBytes ?? INLINE_LIMIT_BYTES;
  if (byteLength <= inlineLimit) {
    return {
      document: { payload, payloadEncoding: "plain", payloadByteLength: byteLength, payloadChunkCount: 0 },
      chunks: []
    };
  }

  const encoded = gzipSync(Buffer.from(payload, "utf8")).toString("base64");
  const chunkSize = options.chunkSizeCharacters ?? CHUNK_SIZE_CHARACTERS;
  const chunks: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += chunkSize) chunks.push(encoded.slice(offset, offset + chunkSize));
  if (chunks.length > MAX_CHUNKS_PER_PAYLOAD) throw new Error("A fetched source is too large to store safely.");
  return {
    document: {
      payloadEncoding: "gzip-base64",
      payloadByteLength: byteLength,
      payloadChunkCount: chunks.length
    },
    chunks
  };
}

export function decodeRawPayload(document: Record<string, unknown>, chunks: string[]): string {
  if (typeof document.payload === "string") return document.payload;
  if (document.payloadEncoding !== "gzip-base64") throw new Error("A stored source payload has an unsupported encoding.");
  const expectedChunks = Number(document.payloadChunkCount);
  if (!Number.isInteger(expectedChunks) || expectedChunks < 1 || chunks.length !== expectedChunks) {
    throw new Error(`A stored source payload is incomplete: expected ${expectedChunks} chunks, received ${chunks.length}.`);
  }
  const payload = gunzipSync(Buffer.from(chunks.join(""), "base64")).toString("utf8");
  const expectedBytes = Number(document.payloadByteLength);
  if (Number.isFinite(expectedBytes) && Buffer.byteLength(payload, "utf8") !== expectedBytes) {
    throw new Error("A stored source payload failed its size check.");
  }
  return payload;
}

export async function saveRawPayload(runId: string, id: string, value: Record<string, unknown> & { payload: string }) {
  const database = getAdminDb();
  const reference = database.doc(`runs/${runId}/raw/${id}`);
  const { payload, ...metadata } = value;
  const encoded = encodeRawPayload(payload);
  const batch = database.batch();
  batch.set(reference, { id, ...metadata, ...encoded.document });
  encoded.chunks.forEach((data, index) => {
    batch.set(reference.collection("chunks").doc(String(index).padStart(4, "0")), { index, data });
  });
  await batch.commit();
}

export async function readRawPayloads(runId: string): Promise<StoredPayload[]> {
  const raw = await getAdminDb().collection(`runs/${runId}/raw`).get();
  return Promise.all(raw.docs.map(async (document) => {
    const data = document.data();
    let chunks: string[] = [];
    if (data.payloadEncoding === "gzip-base64") {
      const chunkSnapshot = await document.ref.collection("chunks").orderBy("index").get();
      chunks = chunkSnapshot.docs.map((chunk) => String(chunk.data().data));
    }
    return {
      id: String(data.id ?? document.id),
      payload: decodeRawPayload(data, chunks),
      url: String(data.url ?? ""),
      fetchedAt: String(data.fetchedAt ?? "")
    };
  }));
}
