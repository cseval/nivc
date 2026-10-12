import type { PasswordValidationStatus } from "firebase/auth";
import { describe, expect, it } from "vitest";
import { passwordPolicyMessage } from "@/lib/auth/password-policy";

const policy = {
  customStrengthOptions: {
    minPasswordLength: 12,
    maxPasswordLength: 4096,
    containsLowercaseLetter: true,
    containsUppercaseLetter: true,
    containsNumericCharacter: true,
    containsNonAlphanumericCharacter: true
  },
  enforcementState: "ENFORCE",
  allowedNonAlphanumericCharacters: "!@#",
  forceUpgradeOnSignin: false
};

function status(overrides: Partial<PasswordValidationStatus>): PasswordValidationStatus {
  return {
    isValid: false,
    passwordPolicy: policy,
    meetsMinPasswordLength: true,
    meetsMaxPasswordLength: true,
    containsLowercaseLetter: true,
    containsUppercaseLetter: true,
    containsNumericCharacter: true,
    containsNonAlphanumericCharacter: true,
    ...overrides
  };
}

describe("Firebase password policy messages", () => {
  it("accepts a password that satisfies the active policy", () => {
    expect(passwordPolicyMessage(status({ isValid: true }))).toBeNull();
  });

  it("lists the exact requirements a password is missing", () => {
    expect(passwordPolicyMessage(status({
      meetsMinPasswordLength: false,
      containsUppercaseLetter: false,
      containsNumericCharacter: false,
      containsNonAlphanumericCharacter: false
    }))).toBe("Password must include at least 12 characters, an uppercase letter, a number, and a symbol.");
  });
});
