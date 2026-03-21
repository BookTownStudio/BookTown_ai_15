import type { WriteContentDoc } from '../../types/entities.ts';

export type WriteContentNode = WriteContentDoc['content'][number];

type SupportedLocale = 'en' | 'ar';
type SupportedDirection = 'ltr' | 'rtl';

type ChapterBlockOptions = {
  title: string;
  lang: SupportedLocale;
  dir: SupportedDirection;
  paragraphs?: string[];
};

export function createChapterSeparatorNode(): WriteContentNode {
  return {
    type: 'horizontalRule',
  };
}

export function createChapterSeparatorHtml(): string {
  return '<hr />';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createTextNode(text: string) {
  return { type: 'text', text };
}

function createHeadingNode(title: string, lang: SupportedLocale, dir: SupportedDirection): WriteContentNode {
  return {
    type: 'heading',
    attrs: {
      level: 2,
      lang,
      dir,
    },
    content: [createTextNode(title)],
  };
}

function createParagraphNode(text: string, lang: SupportedLocale, dir: SupportedDirection): WriteContentNode {
  if (!text) {
    return {
      type: 'paragraph',
      attrs: {
        lang,
        dir,
      },
    };
  }

  return {
    type: 'paragraph',
    attrs: {
      lang,
      dir,
    },
    content: [createTextNode(text)],
  };
}

export function createChapterBlockNodes({
  title,
  lang,
  dir,
  paragraphs,
}: ChapterBlockOptions): WriteContentNode[] {
  const writingParagraphs = paragraphs && paragraphs.length > 0 ? paragraphs : [''];

  return [
    createChapterSeparatorNode(),
    createHeadingNode(title, lang, dir),
    ...writingParagraphs.map((paragraph) => createParagraphNode(paragraph, lang, dir)),
  ];
}

export function createChapterBlockHtml({
  title,
  lang,
  dir,
  paragraphs,
}: ChapterBlockOptions): string {
  const writingParagraphs = paragraphs && paragraphs.length > 0 ? paragraphs : [''];

  return [
    createChapterSeparatorHtml(),
    `<h2 lang="${lang}" dir="${dir}">${escapeHtml(title)}</h2>`,
    ...writingParagraphs.map((paragraph) =>
      paragraph
        ? `<p lang="${lang}" dir="${dir}">${escapeHtml(paragraph)}</p>`
        : `<p lang="${lang}" dir="${dir}"></p>`
    ),
  ].join('');
}
