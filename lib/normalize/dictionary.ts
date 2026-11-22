import variants from "./name-variants.json";

export type VariantMap = Record<string, string[] | string>;

// Turns { canonical: [variants] } into { variant: canonical } for fast lookup
export function buildLookup(map: VariantMap): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [canonical, list] of Object.entries(map)) {
    if (canonical.startsWith("_") || !Array.isArray(list)) continue;
    const key = canonical.toLowerCase();
    lookup.set(key, key);
    for (const v of list) lookup.set(v.toLowerCase(), key);
  }
  return lookup;
}

const DEFAULT_LOOKUP = buildLookup(variants);

export function applyDictionary(s: string, lookup: Map<string, string> = DEFAULT_LOOKUP): string {
  if (s === "") return s;
  return s
    .split(" ")
    .map((word) => lookup.get(word) ?? word)
    .join(" ");
}
