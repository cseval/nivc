import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { AuthenticationError } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const response = NextResponse.json({ status: "signed-out" });
    response.headers.set("cache-control", "no-store");
    response.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    response.cookies.set(CSRF_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    const status = error instanceof AuthenticationError ? error.status : 403;
    const message = error instanceof Error ? error.message : "Sign out could not be completed.";
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
