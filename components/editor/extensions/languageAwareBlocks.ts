import { Editor } from '@tiptap/react';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import { detectLanguageDirection } from '../../../lib/editor/writeDocument.ts';

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
    };
  },
});

function isLanguageBlock(typeName: string): boolean {
  return typeName === 'paragraph' || typeName === 'heading';
}

export function applyAutoLanguageForBlocks(
  editor: Editor,
  fallbackLang = 'en'
): boolean {
  const { state } = editor;
  const tr = state.tr;
  let changed = false;

  state.doc.descendants((node, pos) => {
    if (!isLanguageBlock(node.type.name)) {
      return true;
    }

    if (node.attrs.langManual === true) {
      return true;
    }

    const detected = detectLanguageDirection(node.textContent || '', fallbackLang);
    const currentLang = typeof node.attrs.lang === 'string' ? node.attrs.lang : '';
    const currentDir = node.attrs.dir === 'rtl' || node.attrs.dir === 'ltr' ? node.attrs.dir : '';

    if (currentLang !== detected.lang || currentDir !== detected.dir) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        lang: detected.lang,
        dir: detected.dir,
      });
      changed = true;
    }

    return true;
  });

  if (changed) {
    tr.setMeta('autoLangTagger', true);
    editor.view.dispatch(tr);
    return true;
  }

  return false;
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
