import { NextResponse } from "next/server";
import { AuthenticationError } from "@/lib/auth/session";

export class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

export function apiError(error: unknown, fallback: string): NextResponse {
  if (error instanceof AuthenticationError || error instanceof RequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500, headers: { "cache-control": "no-store" } });
}

export async function jsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new RequestError("The request body must be a JSON object.");
  }
}

export function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new RequestError(`${label} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) throw new RequestError(`${label} is required.`);
  if (trimmed.length > maxLength) throw new RequestError(`${label} must be ${maxLength} characters or fewer.`);
  return trimmed;
}
