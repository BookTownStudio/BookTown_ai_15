import type { Editor } from '@tiptap/react';
import type { Project } from '../../types/entities.ts';

const CURSOR_BLOCK_PREFIX = 'block:';

export type CursorMemoryPayload = Pick<
  Project,
  'lastCursorBlockId' | 'lastCursorOffset' | 'lastCursorSavedAt'
>;

type EditableBlock = {
  blockId: string;
  from: number;
  textLength: number;
};

function getEditableBlocks(editor: Editor): EditableBlock[] {
  const blocks: EditableBlock[] = [];
  let index = 0;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') {
      return true;
    }

    blocks.push({
      blockId: `${CURSOR_BLOCK_PREFIX}${index}`,
      from: pos + 1,
      textLength: node.textContent.length,
    });
    index += 1;
    return true;
  });

  return blocks;
}

function parseBlockIndex(blockId?: string): number | null {
  if (typeof blockId !== 'string' || !blockId.startsWith(CURSOR_BLOCK_PREFIX)) {
    return null;
  }

  const raw = Number.parseInt(blockId.slice(CURSOR_BLOCK_PREFIX.length), 10);
  if (!Number.isInteger(raw) || raw < 0) {
    return null;
  }

  return raw;
}

export function captureCursorMemory(editor: Editor): CursorMemoryPayload | null {
  const selection = editor.state.selection;
  if (!selection.empty) {
    return null;
  }

  const blocks = getEditableBlocks(editor);
  const blockIndex = blocks.findIndex((block) => {
    const maxPosition = block.from + block.textLength;
    return selection.from >= block.from && selection.from <= maxPosition;
  });

  if (blockIndex < 0) {
    return null;
  }

  const block = blocks[blockIndex];
  return {
    lastCursorBlockId: block.blockId,
    lastCursorOffset: Math.max(0, Math.min(selection.from - block.from, block.textLength)),
    lastCursorSavedAt: new Date().toISOString(),
  };
}

export function resolveCursorPosition(
  editor: Editor,
  cursorMemory: Pick<Project, 'lastCursorBlockId' | 'lastCursorOffset'>
): number | null {
  const blocks = getEditableBlocks(editor);
  if (blocks.length === 0) {
    return editor.state.doc.content.size;
  }

  const parsedIndex = parseBlockIndex(cursorMemory.lastCursorBlockId);
  if (parsedIndex === null) {
    const lastBlock = blocks[blocks.length - 1];
    return lastBlock.from + lastBlock.textLength;
  }

  const clampedIndex = Math.min(Math.max(parsedIndex, 0), blocks.length - 1);
  const block = blocks[clampedIndex];
  const offset =
    typeof cursorMemory.lastCursorOffset === 'number' && Number.isFinite(cursorMemory.lastCursorOffset)
      ? Math.max(0, Math.floor(cursorMemory.lastCursorOffset))
      : block.textLength;

  return block.from + Math.min(offset, block.textLength);
}

export function cursorMemoryChanged(
  current: CursorMemoryPayload | null,
  previous: CursorMemoryPayload | null
): boolean {
  if (!current && !previous) {
    return false;
  }

  if (!current || !previous) {
    return true;
  }

  return (
    current.lastCursorBlockId !== previous.lastCursorBlockId ||
    current.lastCursorOffset !== previous.lastCursorOffset
  );
}
