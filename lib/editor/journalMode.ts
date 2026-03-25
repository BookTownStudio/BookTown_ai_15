import type { WriteContentDoc } from '../../types/entities.ts';
import {
  createChapterBlockNodes,
  type WriteContentNode,
} from './chapterNodes.ts';

export const JOURNAL_TEMPLATE_ID = 'journal';
export const JOURNAL_ENTRY_DATE_ATTR = 'journalEntryDate';

type SupportedLocale = 'en' | 'ar';
type SupportedDirection = 'ltr' | 'rtl';

export type JournalEntryMeta = {
  dateKey: string;
  label: string;
};

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function toJournalDateKey(value: Date): string {
  return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`;
}

function formatEnglishJournalDate(date: Date): string {
  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateFormatter.format(date)} — ${timeFormatter.format(date)}`;
}

function formatArabicJournalDate(date: Date): string {
  const dateFormatter = new Intl.DateTimeFormat('ar-QA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('ar-QA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateFormatter.format(date)} — ${timeFormatter.format(date)}`;
}

export function formatJournalEntryLabel(date: Date, locale: SupportedLocale): string {
  return locale === 'ar'
    ? formatArabicJournalDate(date)
    : formatEnglishJournalDate(date);
}

export function buildJournalEntryMeta(date: Date, locale: SupportedLocale): JournalEntryMeta {
  return {
    dateKey: toJournalDateKey(date),
    label: formatJournalEntryLabel(date, locale),
  };
}

function isJournalHeadingNode(node: WriteContentNode): boolean {
  return (
    node.type === 'heading' &&
    typeof node.attrs?.[JOURNAL_ENTRY_DATE_ATTR] === 'string' &&
    node.attrs[JOURNAL_ENTRY_DATE_ATTR].trim().length > 0
  );
}

function extractNodeText(node: WriteContentNode): string {
  if (!Array.isArray(node.content)) {
    return '';
  }

  return node.content
    .map((child) => (typeof child?.text === 'string' ? child.text : ''))
    .join('')
    .trim();
}

export function getLatestJournalEntryMeta(contentDoc?: WriteContentDoc): JournalEntryMeta | null {
  const nodes = Array.isArray(contentDoc?.content) ? contentDoc.content : [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index] as WriteContentNode;
    if (!isJournalHeadingNode(node)) {
      continue;
    }

    return {
      dateKey: String(node.attrs?.[JOURNAL_ENTRY_DATE_ATTR]).trim(),
      label: extractNodeText(node),
    };
  }

  return null;
}

export function createJournalEntryNodes(params: {
  date: Date;
  locale: SupportedLocale;
}): WriteContentNode[] {
  const meta = buildJournalEntryMeta(params.date, params.locale);
  const lang: SupportedLocale = params.locale === 'ar' ? 'ar' : 'en';
  const dir: SupportedDirection = lang === 'ar' ? 'rtl' : 'ltr';

  return createChapterBlockNodes({
    title: meta.label,
    lang,
    dir,
    paragraphs: [''],
    headingAttrs: {
      [JOURNAL_ENTRY_DATE_ATTR]: meta.dateKey,
    },
  });
}
