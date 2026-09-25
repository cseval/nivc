import { revalidateTag } from "next/cache";

export const DATA_CACHE_TAGS = {
  baseline: "nivc:baseline",
  matches: "nivc:matches",
  method: "nivc:method",
  outreach: "nivc:outreach",
  publication: "nivc:publication",
  rankings: "nivc:rankings",
  rules: "nivc:rules",
  schoolNames: "nivc:school-names",
  sourceLog: "nivc:source-log",
  standings: "nivc:standings"
} as const;

export function invalidateDataCache(...tags: string[]) {
  for (const tag of new Set(tags)) revalidateTag(tag);
}

export function invalidatePublishedDataCache() {
  invalidateDataCache(...Object.values(DATA_CACHE_TAGS));
}
