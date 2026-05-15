import { type Editor } from '@tiptap/react';
import { type Transaction } from '@tiptap/pm/state';
import {
  STRUCTURAL_ANCHOR_ATTR,
  STRUCTURAL_CHUNK_ATTR,
} from './structuralAnchors.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

export interface ChunkTransactionMapping {
  affectedChunkIds: string[];
  affectedAnchorIds: string[];
  touchedRangeCount: number;
  unmappedNodeCount: number;
}

function collectNodeIdentity(
  editor: Editor,
  from: number,
  to: number,
  chunkIds: Set<string>,
  anchorIds: Set<string>
): number {
  let unmappedNodeCount = 0;
  const safeFrom = Math.max(0, Math.min(from, editor.state.doc.content.size));
  const safeTo = Math.max(safeFrom, Math.min(to, editor.state.doc.content.size));

  editor.state.doc.nodesBetween(safeFrom, safeTo, (node) => {
    const chunkId = typeof node.attrs[STRUCTURAL_CHUNK_ATTR] === 'string'
      ? node.attrs[STRUCTURAL_CHUNK_ATTR].trim()
      : '';
    const anchorId = typeof node.attrs[STRUCTURAL_ANCHOR_ATTR] === 'string'
      ? node.attrs[STRUCTURAL_ANCHOR_ATTR].trim()
      : '';

    if (chunkId) {
      chunkIds.add(chunkId);
    } else if (node.type.name !== 'text') {
      unmappedNodeCount += 1;
    }
    if (anchorId) {
      anchorIds.add(anchorId);
    }

    return true;
  });

  return unmappedNodeCount;
}

export function mapTransactionToChunkIdentity(
  editor: Editor,
  transaction: Transaction
): ChunkTransactionMapping {
  return writeEditorTelemetry.measure('editor.chunkTransactionMapping', () => {
    const chunkIds = new Set<string>();
    const anchorIds = new Set<string>();
    let touchedRangeCount = 0;
    let unmappedNodeCount = 0;

    transaction.steps.forEach((_step, index) => {
      const map = transaction.mapping.maps[index];
      map?.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        touchedRangeCount += 1;
        const from = Math.max(0, newStart - 1);
        const to = Math.min(editor.state.doc.content.size, Math.max(newEnd + 1, from + 1));
        unmappedNodeCount += collectNodeIdentity(editor, from, to, chunkIds, anchorIds);
      });
    });

    if (transaction.docChanged && touchedRangeCount === 0) {
      const selectionFrom = transaction.selection.from;
      const selectionTo = transaction.selection.to;
      touchedRangeCount = 1;
      unmappedNodeCount += collectNodeIdentity(editor, selectionFrom, selectionTo, chunkIds, anchorIds);
    }

    const result: ChunkTransactionMapping = {
      affectedChunkIds: Array.from(chunkIds).sort(),
      affectedAnchorIds: Array.from(anchorIds).sort(),
      touchedRangeCount,
      unmappedNodeCount,
    };

    writeEditorTelemetry.log('editor', 'chunk_transaction_mapped', {
      affectedChunkCount: result.affectedChunkIds.length,
      affectedAnchorCount: result.affectedAnchorIds.length,
      touchedRangeCount: result.touchedRangeCount,
      unmappedNodeCount: result.unmappedNodeCount,
    }, 'debug');
    writeEditorTelemetry.gauge('editor.affectedChunkCount', result.affectedChunkIds.length);
    writeEditorTelemetry.gauge('editor.affectedAnchorCount', result.affectedAnchorIds.length);
    writeEditorTelemetry.gauge('editor.unmappedTransactionNodeCount', result.unmappedNodeCount);

    return result;
  });
}
