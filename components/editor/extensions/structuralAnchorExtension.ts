import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import {
  STRUCTURAL_ANCHOR_ATTR,
  STRUCTURAL_CHUNK_ATTR,
  STRUCTURAL_SECTION_ATTR,
} from '../../../lib/editor/structuralAnchors.ts';
import { writeEditorTelemetry } from '../../../lib/editor/writeEditorTelemetry.ts';

const ANCHORABLE_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'horizontalRule',
]);

const pluginKey = new PluginKey('booktownStructuralAnchors');

function createRuntimeAnchorId(typeName: string, pos: number, sequence: number): string {
  return `anc_rt_${typeName}_${pos.toString(36)}_${sequence.toString(36)}`;
}

function assignMissingAnchors(transaction: Transaction): Transaction | null {
  const seen = new Set<string>();
  let sequence = 0;
  let nextTransaction: Transaction | null = null;

  transaction.doc.descendants((node, pos) => {
    if (!ANCHORABLE_NODE_TYPES.has(node.type.name)) {
      return true;
    }

    const anchorId = typeof node.attrs[STRUCTURAL_ANCHOR_ATTR] === 'string'
      ? node.attrs[STRUCTURAL_ANCHOR_ATTR].trim()
      : '';
    const shouldRepair = !anchorId || seen.has(anchorId);
    if (anchorId && !seen.has(anchorId)) {
      seen.add(anchorId);
    }
    if (!shouldRepair) {
      return true;
    }

    sequence += 1;
    const nextAnchorId = createRuntimeAnchorId(node.type.name, pos, sequence);
    seen.add(nextAnchorId);
    nextTransaction = nextTransaction ?? transaction;
    nextTransaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      [STRUCTURAL_ANCHOR_ATTR]: nextAnchorId,
    });
    return true;
  });

  return nextTransaction;
}

export const StructuralAnchorExtension = Extension.create({
  name: 'booktownStructuralAnchors',

  addGlobalAttributes() {
    return [
      {
        types: Array.from(ANCHORABLE_NODE_TYPES),
        attributes: {
          [STRUCTURAL_ANCHOR_ATTR]: {
            default: null,
            rendered: false,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-bt-anchor-id'),
            renderHTML: () => ({}),
          },
          [STRUCTURAL_SECTION_ATTR]: {
            default: null,
            rendered: false,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-bt-section-id'),
            renderHTML: () => ({}),
          },
          [STRUCTURAL_CHUNK_ATTR]: {
            default: null,
            rendered: false,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-bt-chunk-id'),
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        appendTransaction: (_transactions, _oldState, newState) => {
          const finish = writeEditorTelemetry.startTimer('editor.structuralAnchorRepair');
          const repair = assignMissingAnchors(newState.tr);
          if (!repair) {
            finish();
            return null;
          }

          repair.setMeta(pluginKey, true);
          repair.setMeta('addToHistory', false);
          writeEditorTelemetry.increment('editor.structuralAnchorRepair');
          finish();
          return repair;
        },
      }),
    ];
  },
});
