import type { RpiRules } from "@/lib/rpi/types";

export const RPI_RULE_NUMBER_FIELDS: Array<keyof Omit<RpiRules, "status">> = [
  "topWinBandEnd",
  "secondWinBandEnd",
  "strongNonconfBandEnd",
  "firstLossBandStart",
  "firstLossBandEnd",
  "severeLossBandStart",
  "weakNonconfBandStart",
  "scheduleThreshold",
  "topWinBonus",
  "secondWinBonus",
  "firstLossPenalty",
  "severeLossPenalty",
  "scheduleBonus",
  "schedulePenalty",
  "winWeight",
  "opponentWeight",
  "opponentsOpponentWeight"
];

const RULE_STATUSES = new Set(["Ready", "Draft", "Review"]);

export function parseRpiRules(value: unknown): RpiRules {
  if (!value || typeof value !== "object") throw new Error("RPI rules are missing.");
  const source = value as Record<string, unknown>;
  const parsed = {} as RpiRules;
  for (const field of RPI_RULE_NUMBER_FIELDS) {
    const number = source[field];
    if (typeof number !== "number" || !Number.isFinite(number)) {
      throw new Error(`RPI rule ${field} must be a finite number.`);
    }
    (parsed[field] as number) = number;
  }
  if (typeof source.status !== "string" || !RULE_STATUSES.has(source.status)) {
    throw new Error("RPI rule status must be Ready, Draft or Review.");
  }
  parsed.status = source.status;
  return parsed;
}
