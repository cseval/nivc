import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/policy";
import { AuthenticationError } from "@/lib/auth/session";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FIRESTORE_QUOTA_MESSAGE, isFirestoreQuotaError } from "@/lib/firebase/errors";

type SessionRequest = {
  idToken?: unknown;
  synchronizeRole?: unknown;
};

type AppRole = "admin" | "member";

function claimedRole(value: unknown): AppRole | null {
  return value === "admin" || value === "member" ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const body = await request.json() as SessionRequest;
    if (typeof body.idToken !== "string" || !body.idToken) {
      return NextResponse.json({ error: "A Firebase ID token is required." }, { status: 400 });
    }
    if (typeof body.synchronizeRole !== "boolean") {
      return NextResponse.json({ error: "The role synchronization setting is required." }, { status: 400 });
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
    let role = claimedRole(decoded.appRole);

    if (body.synchronizeRole) {
      const userReference = getAdminDb().doc(`users/${decoded.uid}`);
      const existing = await userReference.get();
      const existingData = existing.data();
      role = existingData?.role === "admin" ? "admin" : "member";
      if (!existing.exists) {
        await userReference.set({
          email,
          displayName,
          role,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else if (existingData?.email !== email || existingData?.displayName !== displayName) {
        await userReference.update({ email, displayName, updatedAt: FieldValue.serverTimestamp() });
      }

      if (claimedRole(userRecord.customClaims?.appRole) !== role) {
        await auth.setCustomUserClaims(decoded.uid, { ...(userRecord.customClaims ?? {}), appRole: role });
      }

      if (claimedRole(decoded.appRole) !== role) {
        return NextResponse.json(
          { status: "refresh-claims" },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }
    }

    if (!role) throw new AuthenticationError("Your account role could not be verified. Sign in again.", 403);

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
    if (isFirestoreQuotaError(error)) {
      return NextResponse.json(
        { error: FIRESTORE_QUOTA_MESSAGE },
        { status: 503, headers: { "cache-control": "no-store", "retry-after": "3600" } }
      );
    }
    const status = error instanceof AuthenticationError ? error.status : 401;
    const message = error instanceof AuthenticationError
      ? error.message
      : "The secure session could not be created. Check your credentials and try again.";
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
