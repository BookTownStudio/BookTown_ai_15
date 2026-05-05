/**
 * Arabic transliteration dictionary — manually curated mappings
 * from Latin phonetic spellings to Arabic script equivalents.
 *
 * Includes:
 * - Common Arabic literary authors (Egyptian, Palestinian, etc.)
 * - Literary and cultural terms
 * - Spelling variants (e.g., mahfouz / mahfuz)
 *
 * Case-insensitive lookup.
 * Not comprehensive; new entries should be added as gaps are identified
 * from user queries and search analytics.
 */

type TransliterationEntry = {
  latin: string;
  arabic: string;
  aliases?: string[];
};

const TRANSLITERATION_ENTRIES: TransliterationEntry[] = [
  { latin: "mahfouz", arabic: "محفوظ", aliases: ["mahfuz"] },
  { latin: "naguib mahfouz", arabic: "نجيب محفوظ" },
  { latin: "kanafani", arabic: "كنعاني" },
  { latin: "ghassan kanafani", arabic: "غسان كنعاني" },
  { latin: "men in the sun", arabic: "رجال في الشمس" },
  { latin: "darwish", arabic: "درويش" },
  { latin: "mahmoud darwish", arabic: "محمود درويش" },
  { latin: "sum of my parts", arabic: "مجموع أجزائي" },
  { latin: "husain", arabic: "حسين", aliases: ["hussain"] },
  { latin: "taha hussein", arabic: "طه حسين" },
  { latin: "al ayam", arabic: "الأيام", aliases: ["al-ayam"] },
  { latin: "amin", arabic: "أمين" },
  { latin: "ahmad amin", arabic: "أحمد أمين" },
  { latin: "musa", arabic: "موسى" },
  { latin: "fatima musa", arabic: "فاطمة موسى" },
  { latin: "bayt al shaar", arabic: "بيت الشاعر", aliases: ["bayt al-shaar"] },
  { latin: "qasr", arabic: "قصر" },
  { latin: "suq", arabic: "سوق", aliases: ["souk", "souq"] },
  { latin: "divan", arabic: "ديوان", aliases: ["diwan"] },
  { latin: "riwaya", arabic: "رواية", aliases: ["rivaya"] },
  { latin: "shair", arabic: "شاعر", aliases: ["sha'ir"] },
  { latin: "adab", arabic: "أدب" },
  { latin: "sahafa", arabic: "صحافة" },
  { latin: "injil", arabic: "إنجيل" },
  { latin: "quran", arabic: "قرآن", aliases: ["koran"] },
  { latin: "hadith", arabic: "حديث", aliases: ["hadeeth"] },
  { latin: "salah", arabic: "صلاح" },
  { latin: "salem", arabic: "سالم", aliases: ["saleem"] },
  { latin: "amira", arabic: "أميرة" },
  { latin: "leila", arabic: "ليلة", aliases: ["layla", "laylah"] },
  { latin: "laila", arabic: "ليلى", aliases: ["lyla", "layla"] },
  { latin: "tariq", arabic: "طارق" },
  { latin: "qamar", arabic: "قمر" },
  { latin: "shams", arabic: "شمس" },
  { latin: "noor", arabic: "نور", aliases: ["nur"] },
  { latin: "nasr", arabic: "نصر" },
  { latin: "samir", arabic: "سمير", aliases: ["sameer"] },
  { latin: "karim", arabic: "كريم", aliases: ["kareem"] },
  { latin: "karim", arabic: "كريم" },
  { latin: "safiya", arabic: "صفية" },
  { latin: "lamar", arabic: "لمر" },
  { latin: "wafaa", arabic: "وفاء", aliases: ["wafa"] },
  { latin: "yasmin", arabic: "ياسمين" },
  { latin: "amina", arabic: "أمينة", aliases: ["aminah"] },
  { latin: "nur", arabic: "نور" },
  { latin: "jamila", arabic: "جميلة", aliases: ["jamilah"] },
  { latin: "hana", arabic: "هناء" },
  { latin: "fatima", arabic: "فاطمة", aliases: ["fatimah"] },
  { latin: "zainab", arabic: "زينب", aliases: ["zaynab"] },
  { latin: "ayesha", arabic: "عائشة", aliases: ["aisha", "aisah"] },
  { latin: "rashid", arabic: "راشد", aliases: ["rasheed"] },
  { latin: "ali", arabic: "علي" },
  { latin: "hassan", arabic: "حسن", aliases: ["hasan"] },
  { latin: "husain", arabic: "حسين", aliases: ["hussain", "hussein"] },
  { latin: "farah", arabic: "فرح" },
  { latin: "rana", arabic: "رنا" },
  { latin: "muna", arabic: "منى" },
  { latin: "huda", arabic: "هدى" },
  { latin: "wafa", arabic: "وفاء" },
  { latin: "hamza", arabic: "همزة", aliases: ["hamzah"] },
  { latin: "jinn", arabic: "جن", aliases: ["djinn", "djin"] },
  { latin: "ifrit", arabic: "إفريت", aliases: ["afreet", "afrit"] },
  { latin: "oud", arabic: "عود" },
  { latin: "ney", arabic: "نى", aliases: ["ney"] },
  { latin: "raq", arabic: "رق" },
  { latin: "zikr", arabic: "ذكر", aliases: ["dhikr"] },
  { latin: "sama", arabic: "سماع" },
  { latin: "wali", arabic: "والي", aliases: ["vali"] },
  { latin: "qadi", arabic: "قاضي", aliases: ["qazi", "kadi"] },
  { latin: "muezzin", arabic: "مؤذن", aliases: ["mu'adhdhin", "muaddin"] },
  { latin: "imam", arabic: "إمام" },
  { latin: "caliph", arabic: "خليفة", aliases: ["khalifah"] },
  { latin: "sultan", arabic: "سلطان" },
  { latin: "emir", arabic: "أمير", aliases: ["amir", "emir"] },
];

const normalizeKey = (str: string): string => str.toLowerCase().trim();

const INDEX: Map<string, string[]> = new Map();

for (const entry of TRANSLITERATION_ENTRIES) {
  const key = normalizeKey(entry.latin);
  const arabicForms = [entry.arabic];

  INDEX.set(key, arabicForms);

  if (entry.aliases) {
    for (const alias of entry.aliases) {
      INDEX.set(normalizeKey(alias), arabicForms);
    }
  }
}

/**
 * Looks up Arabic transliteration(s) for a given Latin token.
 * Case-insensitive.
 *
 * @param latinToken — Latin phonetic spelling (e.g., "mahfouz")
 * @returns Array of Arabic equivalents, or empty array if no match found
 *
 * @example
 * lookup("mahfouz") → ["محفوظ"]
 * lookup("mahfuz")  → ["محفوظ"]
 * lookup("unknown") → []
 */
export function lookup(latinToken: string): string[] {
  const key = normalizeKey(latinToken);
  return INDEX.get(key) || [];
}

/**
 * Looks up the primary (first) Arabic form for a Latin token.
 * Useful for fallback queries where only one form is needed.
 *
 * @param latinToken — Latin phonetic spelling
 * @returns Single Arabic form, or empty string if no match found
 */
export function lookupPrimary(latinToken: string): string {
  const forms = lookup(latinToken);
  return forms[0] || "";
}

/**
 * Checks if a Latin token has a transliteration mapping.
 */
export function hasTransliteration(latinToken: string): boolean {
  return lookup(latinToken).length > 0;
}

export default { lookup, lookupPrimary, hasTransliteration };
