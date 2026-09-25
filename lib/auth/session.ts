import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isAllowedEmail } from "@/lib/auth/policy";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export type AppRole = "member" | "admin";

export type AppSession = {
  uid: string;
  email: string;
  displayName: string;
  role: AppRole;
};

export class AuthenticationError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthenticationError";
    this.status = status;
  }
}

async function resolveSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    if (!decoded.email_verified || !isAllowedEmail(decoded.email)) return null;

    const userDocument = await getAdminDb().doc(`users/${decoded.uid}`).get();
    if (!userDocument.exists) return null;
    const userData = userDocument.data();
    const role: AppRole = userData?.role === "admin" ? "admin" : "member";
    return {
      uid: decoded.uid,
      email: decoded.email,
      displayName: String(userData?.displayName || decoded.name || decoded.email),
      role
    };
  } catch {
    return null;
  }
}

export const getOptionalSession = cache(resolveSession);

export async function requirePageSession(): Promise<AppSession> {
  const session = await getOptionalSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireApiSession(requiredRole?: AppRole): Promise<AppSession> {
  // Route handlers run outside a React render. Resolve their cookie directly so
  // session state is never shared by a memoization boundary between requests.
  const session = await resolveSession();
  if (!session) throw new AuthenticationError("Sign in with a verified team account to continue.");
  if (requiredRole === "admin" && session.role !== "admin") {
    throw new AuthenticationError("Administrator access is required.", 403);
  }
  return session;
}
