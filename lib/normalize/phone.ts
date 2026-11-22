// ٠١٢٣٤٥٦٧٨٩ and ۰۱۲۳۴۵۶۷۸۹
const ARABIC_INDIC = /[\u0660-\u0669]/g;
const EASTERN_ARABIC_INDIC = /[\u06F0-\u06F9]/g;

export function toLatinDigits(s: string): string {
  return s
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EASTERN_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// Lebanese number -> +961 + national number without the leading 0.
// Returns null for anything that can't be a Lebanese number.
export function normalizePhone(input: string): string | null {
  let digits = toLatinDigits(input).replace(/\D/g, "");

  if (digits.startsWith("00961")) digits = digits.slice(5);
  else if (digits.startsWith("961")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);

  // 70, 71, 76, 78, 79, 81... mobiles have 8 digits; 03 mobiles and landlines have 7
  if (/^[78]\d{7}$/.test(digits)) return `+961${digits}`;
  if (/^[1-9]\d{6}$/.test(digits)) return `+961${digits}`;

  return null;
}
