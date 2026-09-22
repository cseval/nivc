import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { createRefreshRun } from "@/lib/pipeline/run";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ error: "Sign in as an admin to start a rerun." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email?.endsWith("@triplecrownsports.com")) return Response.json({ error: "A Triple Crown Sports account is required." }, { status: 403 });
    const user = await getAdminDb().doc(`users/${decoded.uid}`).get();
    if (user.data()?.role !== "admin") return Response.json({ error: "Admin access is required." }, { status: 403 });
    const runId = await createRefreshRun("admin", decoded.uid);
    return Response.json({ runId, status: "queued" }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
