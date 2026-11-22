export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeLatin(s: string): string {
  return collapseSpaces(s.toLowerCase().replace(/-/g, " "));
}

// "El Masri", "Al Masri" and "Masri" are the same family name.
// A final "al" is kept because it could be a name on its own.
export function dropLatinArticle(s: string): string {
  return s
    .split(" ")
    .filter((word, i, words) => !((word === "el" || word === "al") && i < words.length - 1))
    .join(" ");
}
