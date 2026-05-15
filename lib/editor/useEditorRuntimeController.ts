import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { type Editor } from '@tiptap/react';
import { useDebounce } from 'use-debounce';
import { devLog } from '../logging/devLog.ts';
import { type Project } from '../../types/entities.ts';
import {
    createJournalEntryNodes,
    getLatestJournalEntryMeta,
    toJournalDateKey,
} from './journalMode.ts';
import { getChapterBlockParagraphSelectionOffset } from './chapterNodes.ts';
import {
    type AuthorityStatus,
    type EditorSnapshot,
    getProjectCursorMemory,
} from './editorRuntimeTypes.ts';
import { resolveCursorPosition, type CursorMemoryPayload } from './cursorMemory.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

export type DictationAnchor = {
    from: number;
    to: number;
    nextPos: number;
    replaceSelection: boolean;
};

interface UseEditorRuntimeControllerParams {
    project?: Project;
    lang: string;
    authorityStatus: AuthorityStatus;
    journalModeActive: boolean;
    hasHydratedRef: MutableRefObject<boolean>;
    presentRef: MutableRefObject<EditorSnapshot>;
    lastPersistedCursorRef: MutableRefObject<CursorMemoryPayload | null>;
    dictationAnchorRef: MutableRefObject<DictationAnchor | null>;
    suppressDictationAnchorMappingRef: MutableRefObject<boolean>;
    persistCursorMemoryRef: MutableRefObject<(() => Promise<boolean>) | null>;
}

function shouldHandleJournalInput(inputType: string): boolean {
    return (
        inputType === 'insertText' ||
        inputType === 'insertCompositionText' ||
        inputType === 'insertFromPaste'
    );
}

export function useEditorRuntimeController({
    project,
    lang,
    authorityStatus,
    journalModeActive,
    hasHydratedRef,
    presentRef,
    lastPersistedCursorRef,
    dictationAnchorRef,
    suppressDictationAnchorMappingRef,
    persistCursorMemoryRef,
}: UseEditorRuntimeControllerParams) {
    const [editor, setEditor] = useState<Editor | null>(null);
    const [cursorPersistenceSignal, setCursorPersistenceSignal] = useState(0);
    const [debouncedCursorPersistenceSignal] = useDebounce(cursorPersistenceSignal, 1200);
    const editorScrollRef = useRef<HTMLDivElement | null>(null);
    const cursorRestoreAppliedRef = useRef(false);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const handleTransaction = ({ transaction }: { transaction: any }) => {
            writeEditorTelemetry.measure('editor.transactionObserver', () => {
                const anchor = dictationAnchorRef.current;
                if (!anchor || !transaction?.docChanged) {
                    return;
                }

                if (suppressDictationAnchorMappingRef.current) {
                    suppressDictationAnchorMappingRef.current = false;
                    return;
                }

                anchor.from = transaction.mapping.map(anchor.from, -1);
                anchor.to = transaction.mapping.map(anchor.to, 1);
                anchor.nextPos = transaction.mapping.map(anchor.nextPos, 1);
            }, {
                docChanged: transaction?.docChanged === true,
            });
        };

        editor.on('transaction', handleTransaction);
        return () => {
            editor.off('transaction', handleTransaction);
        };
    }, [dictationAnchorRef, editor, suppressDictationAnchorMappingRef]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const markCursorDirty = () => {
            writeEditorTelemetry.measure('editor.selectionUpdate', () => {
                setCursorPersistenceSignal((value) => value + 1);
            });
        };

        editor.on('selectionUpdate', markCursorDirty);
        return () => {
            editor.off('selectionUpdate', markCursorDirty);
        };
    }, [editor]);

    useEffect(() => {
        if (!editor || !journalModeActive) {
            return;
        }

        const handleBeforeInput = (event: Event) => {
            if (!hasHydratedRef.current) {
                return;
            }

            const inputEvent = event as InputEvent;
            const inputType = typeof inputEvent.inputType === 'string' ? inputEvent.inputType : '';
            if (!shouldHandleJournalInput(inputType)) {
                return;
            }

            const today = new Date();
            const todayKey = toJournalDateKey(today);
            const latestEntry = getLatestJournalEntryMeta(presentRef.current.contentDoc);

            if (latestEntry?.dateKey === todayKey) {
                return;
            }

            event.preventDefault();

            const locale = lang === 'ar' ? 'ar' : 'en';
            const entryNodes = createJournalEntryNodes({ date: today, locale });
            const insertAt = editor.state.doc.content.size;
            const paragraphStart = insertAt + getChapterBlockParagraphSelectionOffset(entryNodes);

            const insertedEntry = editor.commands.insertContentAt(insertAt, entryNodes);
            if (!insertedEntry) {
                return;
            }

            const textPayload =
                typeof inputEvent.data === 'string'
                    ? inputEvent.data
                    : inputType === 'insertFromPaste'
                        ? inputEvent.dataTransfer?.getData('text/plain') ?? ''
                        : '';

            const chain = editor.chain().focus().setTextSelection(paragraphStart);
            if (textPayload) {
                chain.insertContent(textPayload).run();
                return;
            }

            chain.run();
        };

        editor.view.dom.addEventListener('beforeinput', handleBeforeInput);
        return () => {
            editor.view.dom.removeEventListener('beforeinput', handleBeforeInput);
        };
    }, [editor, hasHydratedRef, journalModeActive, lang, presentRef]);

    useEffect(() => {
        if (!editor || !project || authorityStatus !== 'persistent' || cursorRestoreAppliedRef.current === true) {
            return;
        }

        const cursorMemory = getProjectCursorMemory(project);
        if (!cursorMemory) {
            cursorRestoreAppliedRef.current = true;
            return;
        }

        cursorRestoreAppliedRef.current = true;
        requestAnimationFrame(() => {
            const position = resolveCursorPosition(editor, cursorMemory);
            if (position === null) {
                return;
            }

            editor.chain().focus().setTextSelection(position).scrollIntoView().run();
        });
    }, [authorityStatus, editor, project]);

    useEffect(() => {
        if (
            debouncedCursorPersistenceSignal === 0 ||
            !hasHydratedRef.current ||
            authorityStatus !== 'persistent'
        ) {
            return;
        }

        void persistCursorMemoryRef.current?.();
    }, [authorityStatus, debouncedCursorPersistenceSignal, hasHydratedRef, persistCursorMemoryRef]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const handleBlur = () => {
            setCursorPersistenceSignal((value) => value + 1);
            void persistCursorMemoryRef.current?.();
        };

        editor.on('blur', handleBlur);
        return () => {
            editor.off('blur', handleBlur);
        };
    }, [editor, persistCursorMemoryRef]);

    const handleOutlineSelect = useCallback((item: { pos: number }) => {
        if (!editor || !editorScrollRef.current) return;

        const targetPos = Math.max(1, item.pos + 1);
        editor.chain().focus().setTextSelection(targetPos).run();

        requestAnimationFrame(() => {
            const scrollContainer = editorScrollRef.current;
            if (!scrollContainer) return;

            try {
                const coords = editor.view.coordsAtPos(targetPos);
                const containerRect = scrollContainer.getBoundingClientRect();
                const topPadding = 20;
                const nextTop = scrollContainer.scrollTop + coords.top - containerRect.top - topPadding;

                scrollContainer.scrollTo({
                    top: Math.max(0, nextTop),
                    behavior: 'smooth',
                });
            } catch (error) {
                devLog('Outline navigation failed to resolve editor coordinates', error);
            }
        });
    }, [editor]);

    const resetRuntimeController = useCallback(() => {
        cursorRestoreAppliedRef.current = false;
        lastPersistedCursorRef.current = null;
        setCursorPersistenceSignal(0);
    }, [lastPersistedCursorRef]);

    return {
        editor,
        setEditor,
        editorScrollRef,
        handleOutlineSelect,
        resetRuntimeController,
    };
}
