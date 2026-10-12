import type { PasswordValidationStatus } from "firebase/auth";

function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function passwordPolicyMessage(status: PasswordValidationStatus): string | null {
  if (status.isValid) return null;

  const requirements: string[] = [];
  const options = status.passwordPolicy.customStrengthOptions;

  if (status.meetsMinPasswordLength === false) {
    requirements.push(`at least ${options.minPasswordLength ?? 12} characters`);
  }
  if (status.meetsMaxPasswordLength === false && options.maxPasswordLength) {
    requirements.push(`no more than ${options.maxPasswordLength} characters`);
  }
  if (status.containsUppercaseLetter === false) requirements.push("an uppercase letter");
  if (status.containsLowercaseLetter === false) requirements.push("a lowercase letter");
  if (status.containsNumericCharacter === false) requirements.push("a number");
  if (status.containsNonAlphanumericCharacter === false) requirements.push("a symbol");

  return requirements.length
    ? `Password must include ${formatList(requirements)}.`
    : "Password does not meet the current Firebase requirements.";
}
