import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useToast } from '../../store/toast.tsx';
import { useDebounce } from 'use-debounce';

import Button from '../../components/ui/Button.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import Modal from '../../components/ui/Modal.tsx';

import {
  BookIcon,
  QuoteIcon,
  MediaIcon,
  ShelvesIcon,
  AuthorsIcon,
  MapPinIcon,
} from '../../components/icons';

import SelectBookModal from '../../components/modals/SelectBookModal.tsx';
import AttachAuthorModal from '../../components/modals/AttachAuthorModal.tsx';
import AttachShelfModal from '../../components/modals/AttachShelfModal.tsx';
import AttachQuoteModal from '../../components/modals/AttachQuoteModal.tsx';

import { PostAttachment, PostVisibilityScope } from '../../types/entities.ts';
import { AttachmentListV1 } from '../../components/content/AttachmentRendererV1.tsx';
import { useAttachmentUpload } from '../../lib/hooks/useAttachmentUpload.ts';
import { useCreatePost } from '../../lib/hooks/useCreatePost.ts';
import { useDraft, useDrafts, useDeleteDraft, useSaveDraft } from '../../lib/hooks/useDrafts.ts';
import { cn } from '../../lib/utils.ts';

const TEXT_LIMIT = 500;
const AUTOSAVE_DEBOUNCE = 800;

const buildDraftSignature = (
  text: string,
  visibility: PostVisibilityScope,
  attachment: PostAttachment | null
): string =>
  JSON.stringify({
    text: text.trim(),
    visibility,
    attachment: attachment ?? null,
  });

const PostComposerScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang } = useI18n();
  const { user, isGuest } = useAuth();
  const { showToast } = useToast();

  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PostAttachment | null>(null);
  const [visibility, setVisibility] = useState<PostVisibilityScope>('public');
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [exitAction, setExitAction] = useState<'save' | 'discard' | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modals, setModals] = useState({ book: false, author: false, shelf: false, quote: false });
  const attachedBookRef = useRef<string>('');
  const attachedPublicationRef = useRef<string>('');
  const prefillTextRef = useRef<string>('');
  const appliedRouteDraftIdRef = useRef<string | null>(null);
  const previousRouteDraftIdRef = useRef<string>('');
  const lastPersistedDraftSignatureRef = useRef<string>('');
  const handledDraftErrorIdRef = useRef<string | null>(null);
  const previousUidRef = useRef<string | null>(null);

  const { upload, isUploading } = useAttachmentUpload();
  const { mutate: createPost, isLoading: isPosting } = useCreatePost();
  const { data: drafts } = useDrafts();
  const { mutateAsync: saveDraftAsync } = useSaveDraft();
  const { mutateAsync: deleteDraftAsync, isLoading: isDeletingDraft } = useDeleteDraft();

  const [debouncedText] = useDebounce(text, AUTOSAVE_DEBOUNCE);
  const [debouncedVisibility] = useDebounce(visibility, AUTOSAVE_DEBOUNCE);
  const [debouncedAttachment] = useDebounce(attachment, AUTOSAVE_DEBOUNCE);

  const routeDraftId =
    currentView.type === 'immersive' &&
    currentView.id === 'postComposer' &&
    typeof currentView.params?.draftId === 'string'
      ? currentView.params.draftId.trim()
      : '';

  const {
    data: routeDraft,
    isLoading: isRouteDraftLoading,
    isError: isRouteDraftError,
  } = useDraft(routeDraftId || undefined);

  const cancelTarget =
    currentView.type === 'immersive' &&
    currentView.id === 'postComposer' &&
    currentView.params?.from?.type === 'immersive' &&
    currentView.params.from.id === 'projectPublished'
      ? currentView.params.from
      : { type: 'tab', id: 'social' as const };

  useEffect(() => {
    const nextUid = user?.uid ?? null;
    if (previousUidRef.current === null) {
      previousUidRef.current = nextUid;
      return;
    }

    if (previousUidRef.current === nextUid) {
      return;
    }

    previousUidRef.current = nextUid;
    setText('');
    setAttachment(null);
    setVisibility('public');
    setActiveDraftId(null);
    lastPersistedDraftSignatureRef.current = '';
    appliedRouteDraftIdRef.current = null;
    handledDraftErrorIdRef.current = null;
  }, [user?.uid]);

  useEffect(() => {
    if (previousRouteDraftIdRef.current === routeDraftId) return;

    const previousRouteDraftId = previousRouteDraftIdRef.current;
    previousRouteDraftIdRef.current = routeDraftId;
    appliedRouteDraftIdRef.current = null;
    handledDraftErrorIdRef.current = null;

    if (!routeDraftId && previousRouteDraftId) {
      setText('');
      setAttachment(null);
      setVisibility('public');
      setActiveDraftId(null);
      lastPersistedDraftSignatureRef.current = '';
    }
  }, [routeDraftId]);

  useEffect(() => {
    if (!routeDraftId || !routeDraft) return;
    if (appliedRouteDraftIdRef.current === routeDraft.id) return;

    appliedRouteDraftIdRef.current = routeDraft.id;
    setActiveDraftId(routeDraft.id);
    setText(routeDraft.content || '');
    setAttachment(routeDraft.attachment || null);
    setVisibility(routeDraft.visibility || 'public');
    lastPersistedDraftSignatureRef.current = buildDraftSignature(
      routeDraft.content || '',
      routeDraft.visibility || 'public',
      routeDraft.attachment || null
    );
  }, [routeDraft, routeDraftId]);

  useEffect(() => {
    if (!routeDraftId || !isRouteDraftError) return;
    if (handledDraftErrorIdRef.current === routeDraftId) return;

    handledDraftErrorIdRef.current = routeDraftId;
    setActiveDraftId(null);
    showToast(lang === 'en' ? 'Draft unavailable.' : 'المسودة غير متاحة.');
  }, [isRouteDraftError, lang, routeDraftId, showToast]);

  useEffect(() => {
    if (routeDraftId) return;

    const prefillText =
      currentView.type === 'immersive' &&
      currentView.id === 'postComposer' &&
      typeof currentView.params?.prefillText === 'string'
        ? currentView.params.prefillText.trim()
        : '';

    if (!prefillText || prefillTextRef.current === prefillText || text.trim()) return;

    prefillTextRef.current = prefillText;
    setText(prefillText);
  }, [currentView, routeDraftId, text]);

  useEffect(() => {
    if (routeDraftId) return;

    const attachedBook =
      currentView.type === 'immersive' &&
      currentView.id === 'postComposer' &&
      currentView.params &&
      typeof currentView.params.attachedBook === 'object'
        ? (currentView.params.attachedBook as Record<string, unknown>)
        : null;

    const attachedBookId =
      attachedBook && typeof attachedBook.id === 'string'
        ? attachedBook.id.trim()
        : '';

    if (!attachedBookId || attachedBookRef.current === attachedBookId) return;

    attachedBookRef.current = attachedBookId;
    setAttachment({
      type: 'book',
      entityId: attachedBookId,
      bookId: attachedBookId,
    } as PostAttachment);
    showToast(lang === 'en' ? 'Book attached.' : 'تم إرفاق الكتاب.');
  }, [currentView, lang, routeDraftId, showToast]);

  useEffect(() => {
    if (routeDraftId) return;

    const attachedPublication =
      currentView.type === 'immersive' &&
      currentView.id === 'postComposer' &&
      currentView.params &&
      typeof currentView.params.attachedPublication === 'object'
        ? (currentView.params.attachedPublication as Record<string, unknown>)
        : null;

    const attachedPublicationId =
      attachedPublication && typeof attachedPublication.id === 'string'
        ? attachedPublication.id.trim()
        : '';

    if (!attachedPublicationId || attachedPublicationRef.current === attachedPublicationId) return;

    attachedPublicationRef.current = attachedPublicationId;
    setAttachment({
      type: 'publication',
      entityId: attachedPublicationId,
      publicationId: attachedPublicationId,
      ...(typeof attachedPublication.title === 'string' && attachedPublication.title.trim()
        ? { title: attachedPublication.title.trim() }
        : {}),
      ...(typeof attachedPublication.coverUrl === 'string' && attachedPublication.coverUrl.trim()
        ? { coverUrl: attachedPublication.coverUrl.trim() }
        : {}),
      ...(typeof attachedPublication.canonicalSlug === 'string' && attachedPublication.canonicalSlug.trim()
        ? { canonicalSlug: attachedPublication.canonicalSlug.trim() }
        : {}),
    } as PostAttachment);
    showToast(lang === 'en' ? 'Publication attached.' : 'تم إرفاق المنشور.');
  }, [currentView, lang, routeDraftId, showToast]);

  useEffect(() => {
    if (!user || isGuest) return;
    if (routeDraftId && isRouteDraftLoading) return;
    if (routeDraftId && !routeDraft && !isRouteDraftError) return;

    const normalizedText = debouncedText.trim();
    const hasDraftContent = normalizedText.length > 0 || !!debouncedAttachment;
    const nextSignature = buildDraftSignature(
      normalizedText,
      debouncedVisibility,
      debouncedAttachment ?? null
    );

    let cancelled = false;
    const finishAutosave = () => {
      window.setTimeout(() => {
        if (!cancelled) setIsAutosaving(false);
      }, 500);
    };

    if (!hasDraftContent) {
      if (!activeDraftId) {
        lastPersistedDraftSignatureRef.current = '';
        setIsAutosaving(false);
        return () => {
          cancelled = true;
        };
      }

      setIsAutosaving(true);
      void deleteDraftAsync(activeDraftId)
        .then(() => {
          if (cancelled) return;
          setActiveDraftId(null);
          lastPersistedDraftSignatureRef.current = '';
        })
        .catch(() => {
          if (cancelled) return;
          showToast(lang === 'en' ? 'Failed to clear draft.' : 'تعذر حذف المسودة.');
        })
        .finally(finishAutosave);

      return () => {
        cancelled = true;
      };
    }

    if (nextSignature === lastPersistedDraftSignatureRef.current) {
      setIsAutosaving(false);
      return () => {
        cancelled = true;
      };
    }

    setIsAutosaving(true);
    void saveDraftAsync({
      draftId: activeDraftId || undefined,
      content: normalizedText,
      attachment: debouncedAttachment ?? null,
      visibility: debouncedVisibility,
    })
      .then((savedDraft) => {
        if (cancelled) return;
        setActiveDraftId(savedDraft.id);
        lastPersistedDraftSignatureRef.current = nextSignature;
      })
      .catch(() => {
        if (cancelled) return;
        showToast(lang === 'en' ? 'Failed to save draft.' : 'تعذر حفظ المسودة.');
      })
      .finally(finishAutosave);

    return () => {
      cancelled = true;
    };
  }, [
    activeDraftId,
    debouncedAttachment,
    debouncedText,
    debouncedVisibility,
    deleteDraftAsync,
    isGuest,
    isRouteDraftError,
    isRouteDraftLoading,
    lang,
    routeDraft,
    routeDraftId,
    saveDraftAsync,
    showToast,
    user,
  ]);

  const handleOpenDrafts = useCallback(() => {
    navigate({
      type: 'immersive',
      id: 'drafts',
      params: { from: currentView },
    });
  }, [currentView, navigate]);

  const flushDraftNow = useCallback(async () => {
    if (!user || isGuest) {
      throw new Error('Draft save requires an authenticated user.');
    }

    const normalizedText = text.trim();
    const nextSignature = buildDraftSignature(normalizedText, visibility, attachment);
    const savedDraft = await saveDraftAsync({
      draftId: activeDraftId || undefined,
      content: normalizedText,
      attachment,
      visibility,
    });

    setActiveDraftId(savedDraft.id);
    lastPersistedDraftSignatureRef.current = nextSignature;
    return savedDraft.id;
  }, [activeDraftId, attachment, isGuest, saveDraftAsync, text, user, visibility]);

  const handleSaveDraftAndExit = useCallback(async () => {
    setExitAction('save');

    try {
      await flushDraftNow();
      setShowCancelPrompt(false);
      navigate(cancelTarget);
    } catch {
      showToast(lang === 'en' ? 'Failed to save draft.' : 'تعذر حفظ المسودة.');
    } finally {
      setExitAction(null);
    }
  }, [cancelTarget, flushDraftNow, lang, navigate, showToast]);

  const handleDiscard = useCallback(async () => {
    setExitAction('discard');

    try {
      if (activeDraftId) {
        try {
          await deleteDraftAsync(activeDraftId);
        } catch {
          showToast(lang === 'en' ? 'Failed to clear draft.' : 'تعذر حذف المسودة.');
        }
      }

      setShowCancelPrompt(false);
      setActiveDraftId(null);
      setText('');
      setAttachment(null);
      setVisibility('public');
      lastPersistedDraftSignatureRef.current = '';
      navigate(cancelTarget);
    } finally {
      setExitAction(null);
    }
  }, [activeDraftId, cancelTarget, deleteDraftAsync, lang, navigate, showToast]);

  const handlePublish = () => {
    if (isGuest || isPosting || isUploading || isRouteDraftLoading) return;
    if (!text.trim() && !attachment) {
      showToast(lang === 'en' ? 'Empty post' : 'منشور فارغ');
      return;
    }

    const structuredTypes = new Set(['book', 'author', 'quote', 'shelf', 'venue', 'publication']);
    const structuredAttachment =
      attachment &&
      typeof (attachment as { type?: unknown }).type === 'string' &&
      structuredTypes.has(String((attachment as { type?: unknown }).type).toLowerCase())
        ? (attachment as {
            type: string;
            entityId?: string;
            bookId?: string;
            authorId?: string;
            quoteId?: string;
            shelfId?: string;
            venueId?: string;
            publicationId?: string;
          })
        : null;
    const structuredEntityId = structuredAttachment
      ? (typeof structuredAttachment.entityId === 'string' && structuredAttachment.entityId.trim()) ||
        (typeof structuredAttachment.bookId === 'string' && structuredAttachment.bookId.trim()) ||
        (typeof structuredAttachment.authorId === 'string' && structuredAttachment.authorId.trim()) ||
        (typeof structuredAttachment.quoteId === 'string' && structuredAttachment.quoteId.trim()) ||
        (typeof structuredAttachment.shelfId === 'string' && structuredAttachment.shelfId.trim()) ||
        (typeof structuredAttachment.venueId === 'string' && structuredAttachment.venueId.trim()) ||
        (typeof structuredAttachment.publicationId === 'string' && structuredAttachment.publicationId.trim()) ||
        ''
      : '';

    if (structuredAttachment && !structuredEntityId) {
      console.error('[POST_COMPOSER][STRUCTURED_ATTACHMENT_INVALID]', {
        type: structuredAttachment.type,
        attachment,
      });
      showToast(lang === 'en' ? 'Invalid attachment' : 'مرفق غير صالح');
      return;
    }

    createPost(
      {
        content: { text: text.trim() },
        attachments: attachment ? [attachment] : [],
        visibility,
        publishToken: crypto.randomUUID(),
      },
      {
        onSuccess: async (createdPost: any) => {
          if (structuredAttachment) {
            const persistedType =
              typeof createdPost?.primaryEntityType === 'string'
                ? createdPost.primaryEntityType.trim().toLowerCase()
                : '';
            const persistedId =
              typeof createdPost?.primaryEntityId === 'string'
                ? createdPost.primaryEntityId.trim()
                : '';
            const expectedType = structuredAttachment.type.trim().toLowerCase();
            if (persistedType !== expectedType || persistedId !== structuredEntityId) {
              console.error('[POST_COMPOSER][STRUCTURED_ATTACHMENT_DROPPED]', {
                expectedType,
                expectedId: structuredEntityId,
                persistedType,
                persistedId,
                postId: createdPost?.id || null,
              });
            }
          }

          if (activeDraftId) {
            try {
              await deleteDraftAsync(activeDraftId);
            } catch {
              showToast(
                lang === 'en'
                  ? 'Published, but draft cleanup failed.'
                  : 'تم النشر ولكن تعذر حذف المسودة.'
              );
            }
          }

          setActiveDraftId(null);
          lastPersistedDraftSignatureRef.current = '';
          showToast(lang === 'en' ? 'Published' : 'تم النشر');
          navigate(currentView.params?.from || { type: 'tab', id: 'social' });
        },
      }
    );
  };

  const attachmentTypes = [
    { id: 'book', icon: BookIcon, label: 'Book', action: () => setModals((current) => ({ ...current, book: true })) },
    { id: 'author', icon: AuthorsIcon, label: 'Author', action: () => setModals((current) => ({ ...current, author: true })) },
    { id: 'shelf', icon: ShelvesIcon, label: 'Shelf', action: () => setModals((current) => ({ ...current, shelf: true })) },
    { id: 'quote', icon: QuoteIcon, label: 'Quote', action: () => setModals((current) => ({ ...current, quote: true })) },
    { id: 'venue', icon: MapPinIcon, label: 'Venue', action: () => showToast('Venue coming soon') },
    { id: 'media', icon: MediaIcon, label: 'Media', action: () => fileInputRef.current?.click() },
  ];

  const isDraftAvailable = !isGuest && (drafts?.length || 0) > 0;
  const hasDraftableContent = text.trim().length > 0 || !!attachment;
  const canSaveDraftOnExit = hasDraftableContent && !!user && !isGuest;
  const footerDraftLabel = isAutosaving
    ? (lang === 'en' ? 'Saving draft...' : 'جارٍ حفظ المسودة...')
    : activeDraftId
      ? (lang === 'en' ? 'Draft saved' : 'تم حفظ المسودة')
      : '';

  return (
    <div className="h-screen bg-[#0f172a] text-white flex flex-col">
      <header className="flex items-center justify-between px-4 h-16 border-b border-white/5">
        <button onClick={() => setShowCancelPrompt(true)} disabled={isDeletingDraft || !!exitAction}>
          Cancel
        </button>
        <div className="flex gap-2">
          {isDraftAvailable && (
            <button onClick={handleOpenDrafts} className="px-3 py-1 text-xs rounded-full bg-white/5">
              Drafts
            </button>
          )}
          <Button onClick={handlePublish} disabled={isPosting || isUploading || isRouteDraftLoading}>
            {isPosting ? <LoadingSpinner /> : 'Post'}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-6 gap-2 px-4 py-4 border-b border-white/5">
        {attachmentTypes.map((type) => (
          <button
            key={type.id}
            onClick={type.action}
            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-white/5 hover:bg-white/10"
            disabled={isRouteDraftLoading}
          >
            <type.icon className="h-6 w-6" />
            <span className="text-[10px]">{type.label}</span>
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, TEXT_LIMIT))}
        placeholder="What's happening?"
        className="flex-grow px-6 py-6 bg-transparent text-2xl font-serif resize-none focus:outline-none"
        disabled={isRouteDraftLoading}
      />

      {attachment && (
        <div className="px-6 pb-4">
          <AttachmentListV1
            attachments={[attachment]}
            onRemove={() => setAttachment(null)}
            surface="write"
          />
        </div>
      )}

      <footer className="h-14 px-4 flex items-center justify-between border-t border-white/5">
        <span className="text-xs opacity-40">{footerDraftLabel}</span>
        <span className={cn('text-xs', TEXT_LIMIT - text.length < 50 && 'text-amber-400')}>
          {TEXT_LIMIT - text.length} / {TEXT_LIMIT}
        </span>
      </footer>

      <input
        type="file"
        ref={fileInputRef}
        hidden
        accept="image/*"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;

          const attachmentRecord = await upload({
            file,
            type: 'IMAGE',
            parentId: activeDraftId || 'draft',
            parentType: 'drafts',
          });
          if (attachmentRecord) {
            setAttachment(attachmentRecord);
          }
        }}
      />

      <SelectBookModal
        isOpen={modals.book}
        onClose={() => setModals((current) => ({ ...current, book: false }))}
        onBookSelect={(book) =>
          setAttachment({ type: 'book', entityId: book.id, bookId: book.id } as PostAttachment)
        }
      />
      <AttachAuthorModal
        isOpen={modals.author}
        onClose={() => setModals((current) => ({ ...current, author: false }))}
        onSelect={(author) =>
          setAttachment({ type: 'author', entityId: author.id, authorId: author.id } as PostAttachment)
        }
      />
      <AttachShelfModal
        isOpen={modals.shelf}
        onClose={() => setModals((current) => ({ ...current, shelf: false }))}
        onSelect={(shelf) =>
          setAttachment({ type: 'shelf', entityId: shelf.id, shelfId: shelf.id } as PostAttachment)
        }
      />
      <AttachQuoteModal
        isOpen={modals.quote}
        onClose={() => setModals((current) => ({ ...current, quote: false }))}
        onSelect={(quote) => {
          const canonicalQuoteId = quote.canonicalQuoteId || quote.id;
          setAttachment({
            type: 'quote',
            entityId: canonicalQuoteId,
            quoteId: canonicalQuoteId,
            quoteOwnerId: quote.ownerId,
          } as PostAttachment);
        }}
      />

      <Modal
        isOpen={showCancelPrompt}
        onClose={() => {
          if (!exitAction && !isDeletingDraft) {
            setShowCancelPrompt(false);
          }
        }}
      >
        <div className="space-y-4">
          <div className="space-y-2 pr-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {lang === 'en' ? 'Leave composer?' : 'مغادرة المحرر؟'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {canSaveDraftOnExit
                ? (lang === 'en'
                    ? 'Save this draft before leaving, discard it, or keep editing.'
                    : 'احفظ هذه المسودة قبل المغادرة، أو تجاهلها، أو واصل التحرير.')
                : (lang === 'en'
                    ? 'Discard this composer or keep editing.'
                    : 'تجاهل هذا المحرر أو واصل التحرير.')}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {canSaveDraftOnExit && (
              <Button
                onClick={() => void handleSaveDraftAndExit()}
                disabled={!!exitAction || isDeletingDraft}
                className="w-full"
              >
                {exitAction === 'save'
                  ? <LoadingSpinner />
                  : (lang === 'en' ? 'Save Draft' : 'حفظ المسودة')}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => void handleDiscard()}
              disabled={!!exitAction || isDeletingDraft}
              className="w-full"
            >
              {exitAction === 'discard' || isDeletingDraft
                ? <LoadingSpinner />
                : (lang === 'en' ? 'Discard' : 'تجاهل')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowCancelPrompt(false)}
              disabled={!!exitAction || isDeletingDraft}
              className="w-full"
            >
              {lang === 'en' ? 'Keep Editing' : 'متابعة التحرير'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PostComposerScreen;
