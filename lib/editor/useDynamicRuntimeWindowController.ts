import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { type Editor } from '@tiptap/react';
import { type Project } from '../../types/entities.ts';
import {
  STRUCTURAL_SECTION_ATTR,
} from './structuralAnchors.ts';
import { type EditorSnapshot } from './editorRuntimeTypes.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

type WindowDirection = 'previous' | 'next';

interface RuntimeWindowResult {
  snapshot: EditorSnapshot;
  runtime: {
    activeSectionId: string;
    loadedSectionIds: string[];
    mountedChunkCount: number;
  };
}

interface UseDynamicRuntimeWindowControllerParams {
  project?: Project;
  editor: Editor | null;
  scrollRef: RefObject<HTMLElement | null>;
  hasHydratedRef: MutableRefObject<boolean>;
  hasLocalEditsRef: MutableRefObject<boolean>;
  presentRef: MutableRefObject<EditorSnapshot>;
  lastConfirmedSnapshotRef: MutableRefObject<EditorSnapshot>;
  shiftRuntimeWindow: (
    project: Project,
    direction: WindowDirection,
    activeSectionId?: string
  ) => Promise<RuntimeWindowResult | null>;
  setSnapshot: (snapshot: EditorSnapshot) => void;
}

function getSelectionSectionId(editor: Editor): string | null {
  const attrs = editor.state.selection.$from.parent.attrs;
  const sectionId = attrs[STRUCTURAL_SECTION_ATTR];
  return typeof sectionId === 'string' && sectionId.trim() ? sectionId.trim() : null;
}

function getScrollDirection(element: HTMLElement): WindowDirection | null {
  const scrollable = element.scrollHeight - element.clientHeight;
  if (scrollable <= 0) {
    return null;
  }

  const ratio = element.scrollTop / scrollable;
  if (ratio > 0.86) return 'next';
  if (ratio < 0.08) return 'previous';
  return null;
}

export function useDynamicRuntimeWindowController({
  project,
  editor,
  scrollRef,
  hasHydratedRef,
  hasLocalEditsRef,
  presentRef,
  lastConfirmedSnapshotRef,
  shiftRuntimeWindow,
  setSnapshot,
}: UseDynamicRuntimeWindowControllerParams): void {
  const activeRequestRef = useRef<Promise<void> | null>(null);
  const lastShiftKeyRef = useRef<string>('');
  const lastScrollCheckAtRef = useRef(0);

  const requestWindowShift = useCallback((direction: WindowDirection, reason: 'scroll' | 'cursor') => {
    if (!project || !editor || !hasHydratedRef.current || !presentRef.current.isPartialManuscript) {
      return;
    }

    const currentActiveSectionId = presentRef.current.activeSectionId;
    const shiftKey = `${direction}:${currentActiveSectionId ?? 'none'}:${reason}`;
    if (lastShiftKeyRef.current === shiftKey || activeRequestRef.current) {
      return;
    }

    if (hasLocalEditsRef.current || editor.isFocused) {
      writeEditorTelemetry.log('hydration', 'runtime_window_shift_guarded', {
        direction,
        reason,
        hasLocalEdits: hasLocalEditsRef.current,
        editorFocused: editor.isFocused,
      }, 'debug');
      return;
    }

    lastShiftKeyRef.current = shiftKey;
    const run = async () => {
      const finish = writeEditorTelemetry.startTimer('virtualization.windowTransition', {
        direction,
        reason,
      });
      try {
        const result = await shiftRuntimeWindow(project, direction, currentActiveSectionId);
        if (!result) {
          return;
        }

        const nextSnapshot = {
          ...result.snapshot,
          titleEn: presentRef.current.titleEn,
          titleAr: presentRef.current.titleAr,
          wordCount: presentRef.current.wordCount,
        };
        presentRef.current = nextSnapshot;
        lastConfirmedSnapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
        writeEditorTelemetry.log('hydration', 'runtime_window_transition_committed', {
          direction,
          reason,
          activeSectionId: result.runtime.activeSectionId,
          mountedSectionCount: result.runtime.loadedSectionIds.length,
          mountedChunkCount: result.runtime.mountedChunkCount,
        }, 'debug');
      } finally {
        finish();
        activeRequestRef.current = null;
      }
    };

    activeRequestRef.current = run();
  }, [
    editor,
    hasHydratedRef,
    hasLocalEditsRef,
    lastConfirmedSnapshotRef,
    presentRef,
    project,
    setSnapshot,
    shiftRuntimeWindow,
  ]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleSelectionUpdate = () => {
      if (!presentRef.current.isPartialManuscript) {
        return;
      }

      const finish = writeEditorTelemetry.startTimer('virtualization.cursorHydration');
      const sectionId = getSelectionSectionId(editor);
      const mountedSectionIds = presentRef.current.mountedSectionIds ?? [];
      const isMounted = sectionId ? mountedSectionIds.includes(sectionId) : true;
      writeEditorTelemetry.gauge('virtualization.selectionMounted', isMounted ? 1 : 0);
      if (sectionId && !isMounted) {
        requestWindowShift(sectionId < (presentRef.current.activeSectionId ?? sectionId) ? 'previous' : 'next', 'cursor');
      }
      finish();
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, presentRef, requestWindowShift]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollCheckAtRef.current < 250) {
        return;
      }
      lastScrollCheckAtRef.current = now;
      const direction = getScrollDirection(element);
      if (!direction) {
        return;
      }

      const finish = writeEditorTelemetry.startTimer('virtualization.scrollHydration', {
        direction,
      });
      requestWindowShift(direction, 'scroll');
      finish();
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [requestWindowShift, scrollRef]);
}
