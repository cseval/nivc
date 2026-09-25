import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { CSRF_COOKIE_NAME } from "@/lib/auth/constants";
import { AuthenticationError } from "@/lib/auth/session";

function equalTokens(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    throw new AuthenticationError("The request origin was not accepted.", 403);
  }
}

export function assertCsrf(request: NextRequest): void {
  assertSameOrigin(request);
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || !equalTokens(cookieToken, headerToken)) {
    throw new AuthenticationError("The security token expired. Refresh the page and try again.", 403);
  }
}
