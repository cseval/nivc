export const FIRESTORE_QUOTA_MESSAGE = "Firebase's Firestore quota is temporarily exhausted. Try again after the daily quota resets, or contact the app administrator.";

function errorDetails(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");
  const candidate = error as { code?: unknown; details?: unknown; message?: unknown; cause?: unknown };
  return [candidate.code, candidate.details, candidate.message, candidate.cause]
    .filter((value) => value != null)
    .map(String)
    .join(" ");
}

export function isFirestoreQuotaError(error: unknown): boolean {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === 8) return true;
  return /resource[_ -]exhausted|quota exceeded|quota has been exceeded/i.test(errorDetails(error));
}
