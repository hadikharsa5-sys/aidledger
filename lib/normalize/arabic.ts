// Tashkeel (fatha, damma, kasra, shadda, sukun, tanween...) and the superscript alef
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

// Tatweel: the stretching character in محـــمد
const TATWEEL = /\u0640/g;

const ALEF_FORMS = /[آأإٱ]/g;
const ALEF = "ا";

const ALEF_MAQSURA = /ى/g;
const YEH = "ي";

const TEH_MARBUTA = /ة/g;
const HEH = "ه";

export function removeDiacritics(s: string): string {
  return s.replace(DIACRITICS, "");
}

export function removeTatweel(s: string): string {
  return s.replace(TATWEEL, "");
}

export function unifyAlef(s: string): string {
  return s.replace(ALEF_FORMS, ALEF);
}

export function alefMaqsuraToYeh(s: string): string {
  return s.replace(ALEF_MAQSURA, YEH);
}

export function tehMarbutaToHeh(s: string): string {
  return s.replace(TEH_MARBUTA, HEH);
}

export function normalizeArabic(s: string): string {
  // NFKC turns Arabic presentation forms (text copied from PDFs) into normal letters
  let out = s.normalize("NFKC");
  out = removeDiacritics(out);
  out = removeTatweel(out);
  out = unifyAlef(out);
  out = alefMaqsuraToYeh(out);
  out = tehMarbutaToHeh(out);
  return out;
}
