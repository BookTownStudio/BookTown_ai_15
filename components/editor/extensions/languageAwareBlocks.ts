import { Editor } from '@tiptap/react';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import { runEditorLanguageAnalysis } from '../../../lib/editor/editorLanguageAnalysisController.ts';

const baseLanguageAttrs = {
  lang: {
    default: 'en',
    parseHTML: (element: HTMLElement) => element.getAttribute('lang') || 'en',
    renderHTML: (attrs: Record<string, unknown>) =>
      typeof attrs.lang === 'string' && attrs.lang.trim() ? { lang: attrs.lang } : {},
  },
  dir: {
    default: 'ltr',
    parseHTML: (element: HTMLElement) => element.getAttribute('dir') || 'ltr',
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.dir === 'rtl' || attrs.dir === 'ltr' ? { dir: attrs.dir } : {},
  },
  langManual: {
    default: false,
    rendered: false,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-lang-manual') === 'true',
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.langManual === true ? { 'data-lang-manual': 'true' } : {},
  },
};

export const LanguageAwareParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...(this.parent?.() || {}),
      ...baseLanguageAttrs,
    };
  },
});

export const LanguageAwareHeading = Heading.extend({
  addAttributes() {
    return {
      ...(this.parent?.() || {}),
      ...baseLanguageAttrs,
      journalEntryDate: {
        default: null,
        rendered: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-journal-entry-date') || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          typeof attrs.journalEntryDate === 'string' && attrs.journalEntryDate.trim()
            ? { 'data-journal-entry-date': attrs.journalEntryDate }
            : {},
      },
    };
  },
});

export function applyAutoLanguageForBlocks(
  editor: Editor,
  fallbackLang = 'en'
): boolean {
  return runEditorLanguageAnalysis(editor, fallbackLang);
}

export function applyManualLanguageForCurrentBlock(
  editor: Editor,
  lang: string,
  dir: 'ltr' | 'rtl'
): void {
  const attrs = {
    lang,
    dir,
    langManual: true,
  };

  if (editor.isActive('heading')) {
    editor.chain().focus().updateAttributes('heading', attrs).run();
    return;
  }

  editor.chain().focus().updateAttributes('paragraph', attrs).run();
}

export function clearManualLanguageForCurrentBlock(editor: Editor): void {
  const resetAttrs = {
    langManual: false,
  };

  if (editor.isActive('heading')) {
    editor.chain().focus().updateAttributes('heading', resetAttrs).run();
    return;
  }

  editor.chain().focus().updateAttributes('paragraph', resetAttrs).run();
}
