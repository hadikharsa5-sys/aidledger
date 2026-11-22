import { normalizeArabic } from "./arabic";
import { dropLatinArticle, normalizeLatin } from "./latin";
import { applyDictionary } from "./dictionary";

export * from "./arabic";
export * from "./latin";
export * from "./dictionary";
export * from "./phone";

export function normalizeName(input: string): string {
  return applyDictionary(dropLatinArticle(normalizeLatin(normalizeArabic(input))));
}
