import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, CSRF_MAX_AGE_SECONDS } from "@/lib/auth/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const csrfToken = randomBytes(32).toString("base64url");
  const response = NextResponse.json({ csrfToken });
  response.headers.set("cache-control", "no-store");
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: true,
    maxAge: CSRF_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
