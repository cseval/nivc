import { normalizeSchoolName } from "@/lib/slug";
import type { RawGame, SourceConfig } from "@/lib/pipeline/types";

export class NameResolver {
  private used = new Map<string, { sourceName: string; standardName: string; seenIn: Set<string> }>();

  constructor(private readonly config: SourceConfig) {}

  resolve(rawName: string, conferenceId: string): string | null {
    const cleaned = rawName.replace(/^\*/, "").trim();
    const normalized = normalizeSchoolName(cleaned);
    let canonical: string | null = null;
    if (normalized === "miami") {
      canonical = conferenceId === "acc" ? "Miami (FL)" : conferenceId === "mac" ? "Miami (OH)" : null;
    } else if (normalized !== "loyola") {
      canonical = this.config.aliases[normalized]?.canonical ?? null;
    }
    if (canonical) this.record(cleaned, canonical, conferenceId);
    return canonical;
  }

  record(sourceName: string, standardName: string, context: string) {
    const key = `${sourceName}\u0000${standardName}`;
    const entry = this.used.get(key) ?? { sourceName, standardName, seenIn: new Set<string>() };
    entry.seenIn.add(context);
    this.used.set(key, entry);
  }

  corroborate(games: RawGame[]): void {
    for (const game of games) {
      for (const side of [1, 2] as const) {
        const field = side === 1 ? "school1" : "school2";
        if (game[field]) continue;
        const raw = side === 1 ? game.rawSchool1 : game.rawSchool2;
        const prefix = normalizeSchoolName(raw);
        if (!new Set(["miami", "loyola"]).has(prefix)) {
          throw new Error(`Unmatched school name needs review: ${raw}.`);
        }
        const other = side === 1 ? game.school2 : game.school1;
        const ownScore = side === 1 ? game.sets1 : game.sets2;
        const otherScore = side === 1 ? game.sets2 : game.sets1;
        const candidates = new Set<string>();
        for (const candidate of games) {
          if (candidate.date !== game.date || candidate.conferenceId === game.conferenceId) continue;
          if (
            candidate.school1 === other &&
            candidate.sets1 === otherScore &&
            candidate.sets2 === ownScore &&
            candidate.school2 &&
            normalizeSchoolName(candidate.school2).startsWith(prefix)
          ) candidates.add(candidate.school2);
          if (
            candidate.school2 === other &&
            candidate.sets2 === otherScore &&
            candidate.sets1 === ownScore &&
            candidate.school1 &&
            normalizeSchoolName(candidate.school1).startsWith(prefix)
          ) candidates.add(candidate.school1);
        }
        if (candidates.size !== 1) {
          throw new Error(`Unmatched or ambiguous school: ${game.rawSchool1} vs ${game.rawSchool2}, ${game.date}. Candidates: ${Array.from(candidates).join(", ")}. Saved data will be retained.`);
        }
        const canonical = Array.from(candidates)[0];
        game[field] = canonical;
        this.record(raw, canonical, game.conferenceId);
      }
    }
  }

  usedAliases() {
    return Array.from(this.used.values()).map((entry, index) => ({
      id: `${normalizeSchoolName(entry.sourceName)}-${index + 1}`,
      sourceName: entry.sourceName,
      standardName: entry.standardName,
      division: this.config.nonD1[entry.standardName] ?? "D1",
      seenIn: Array.from(entry.seenIn).sort().join(", "),
      matchingNote:
        entry.sourceName === entry.standardName
          ? "Exact name"
          : ["Miami", "Loyola"].includes(entry.sourceName)
            ? "Conference or corroborating match resolves ambiguity"
            : "Reviewed alias"
    }));
  }
}
