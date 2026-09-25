import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/policy";
import { AuthenticationError } from "@/lib/auth/session";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const body = await request.json() as { idToken?: unknown };
    if (typeof body.idToken !== "string" || !body.idToken) {
      return NextResponse.json({ error: "A Firebase ID token is required." }, { status: 400 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(body.idToken, true);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!decoded.auth_time || nowSeconds - decoded.auth_time > 5 * 60) {
      throw new AuthenticationError("Sign in again to start a new secure session.");
    }
    if (!decoded.email_verified) {
      throw new AuthenticationError("Verify your email before signing in.", 403);
    }
    if (!isAllowedEmail(decoded.email)) {
      throw new AuthenticationError("Use a triplecrownsports.com email address.", 403);
    }

    const userRecord = await auth.getUser(decoded.uid);
    if (userRecord.disabled) throw new AuthenticationError("This account is disabled.", 403);
    const email = normalizeEmail(decoded.email);
    const displayName = userRecord.displayName?.trim() || email;
    const userReference = getAdminDb().doc(`users/${decoded.uid}`);
    await getAdminDb().runTransaction(async (transaction) => {
      const existing = await transaction.get(userReference);
      if (!existing.exists) {
        transaction.create(userReference, {
          email,
          displayName,
          role: "member",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        return;
      }
      transaction.update(userReference, { email, displayName, updatedAt: FieldValue.serverTimestamp() });
    });

    const sessionCookie = await auth.createSessionCookie(body.idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000
    });
    const response = NextResponse.json({ status: "signed-in" });
    response.headers.set("cache-control", "no-store");
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    response.cookies.set(CSRF_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    const status = error instanceof AuthenticationError ? error.status : 401;
    const message = error instanceof AuthenticationError
      ? error.message
      : "The secure session could not be created. Check your credentials and try again.";
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
