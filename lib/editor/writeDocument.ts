import { WriteContentDoc, WriteDirection } from '../../types/entities.ts';
import { normalizeWriteContentDocForTransport } from './writeTransportSerialization.ts';

const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT_REGEX = /[A-Za-z]/;
const WORD_TOKEN_REGEX = /[\p{L}\p{N}]+/gu;

export type LanguageDetection = {
  lang: string;
  dir: WriteDirection;
};

export function detectLanguageDirection(
  text: string,
  fallbackLang = 'en'
): LanguageDetection {
  if (!text || !text.trim()) {
    return {
      lang: fallbackLang,
      dir: fallbackLang === 'ar' ? 'rtl' : 'ltr',
    };
  }

  const hasArabic = ARABIC_SCRIPT_REGEX.test(text);
  const hasLatin = LATIN_SCRIPT_REGEX.test(text);

  if (hasArabic && !hasLatin) {
    return { lang: 'ar', dir: 'rtl' };
  }

  if (!hasArabic && hasLatin) {
    return { lang: 'en', dir: 'ltr' };
  }

  if (hasArabic && hasLatin) {
    const arabicCount = (text.match(new RegExp(ARABIC_SCRIPT_REGEX.source, 'g')) || []).length;
    const latinCount = (text.match(/[A-Za-z]/g) || []).length;
    return arabicCount >= latinCount ? { lang: 'ar', dir: 'rtl' } : { lang: 'en', dir: 'ltr' };
  }

  return {
    lang: fallbackLang,
    dir: fallbackLang === 'ar' ? 'rtl' : 'ltr',
  };
}

export function countWordsScriptAware(text: string): number {
  if (!text || !text.trim()) return 0;
  const tokens = text.match(WORD_TOKEN_REGEX);
  return tokens ? tokens.length : 0;
}

export function toWriteContentDoc(
  tiptapJson: Record<string, unknown>,
  plainText: string
): WriteContentDoc {
  const content = Array.isArray(tiptapJson.content) ? tiptapJson.content : [];
  return normalizeWriteContentDocForTransport({
    version: 1,
    type: 'doc',
    content: content as WriteContentDoc['content'],
    plainText: plainText.slice(0, 2_000_000),
  }) as WriteContentDoc;
}

export function isWriteContentDoc(value: unknown): value is WriteContentDoc {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  return (
    doc.version === 1 &&
    doc.type === 'doc' &&
    Array.isArray(doc.content)
  );
}

export function toTiptapDocInput(
  htmlContent: string,
  contentDoc?: WriteContentDoc | null
): string | Record<string, unknown> {
  if (contentDoc && isWriteContentDoc(contentDoc)) {
    return {
      type: 'doc',
      content: contentDoc.content,
    };
  }

  return htmlContent || '<p></p>';
}
