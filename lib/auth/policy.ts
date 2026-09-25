export const TCS_EMAIL_DOMAIN = "triplecrownsports.com";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isAllowedEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  const email = normalizeEmail(value);
  const parts = email.split("@");
  return parts.length === 2 && Boolean(parts[0]) && parts[1] === TCS_EMAIL_DOMAIN;
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
