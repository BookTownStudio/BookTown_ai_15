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
import { QuoteCardDataAdapter } from '../../components/content/QuoteCardDataAdapter.ts';

import { PostAttachment, PostVisibilityScope } from '../../types/entities.ts';
import type { View } from '../../types/navigation.ts';
import {
  buildAuthorPostAttachment,
  buildBookPostAttachment,
  buildPublicationPostAttachment,
  buildQuotePostAttachment,
  buildShelfPostAttachment,
  toPostCreateAttachmentDTO,
} from '../../types/socialAttachments.ts';
import { AttachmentListV1 } from '../../components/content/AttachmentRendererV1.tsx';
import { useAttachmentUpload } from '../../lib/hooks/useAttachmentUpload.ts';
import { useCreatePost } from '../../lib/hooks/useCreatePost.ts';
import { useDraft, useDrafts, useDeleteDraft, useSaveDraft } from '../../lib/hooks/useDrafts.ts';
import { cn } from '../../lib/utils.ts';
import ContentRail from '../../components/layout/ContentRail.tsx';

const TEXT_LIMIT = 500;
const AUTOSAVE_DEBOUNCE = 800;
const EDITOR_MAX_VIEWPORT_RATIO = 0.56;

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
  const { mutate: createPost, isPending: isPosting } = useCreatePost();
  const { data: drafts } = useDrafts();
  const { mutateAsync: saveDraftAsync } = useSaveDraft();
  const { mutateAsync: deleteDraftAsync, isPending: isDeletingDraft } = useDeleteDraft();

  const [debouncedText] = useDebounce(text, AUTOSAVE_DEBOUNCE);
  const [debouncedVisibility] = useDebounce(visibility, AUTOSAVE_DEBOUNCE);
  const [debouncedAttachment] = useDebounce(attachment, AUTOSAVE_DEBOUNCE);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const viewportHeight =
      typeof window === 'undefined' ? 0 : window.innerHeight * EDITOR_MAX_VIEWPORT_RATIO;
    const maxHeight = viewportHeight > 0 ? viewportHeight : textarea.scrollHeight;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [text]);

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

  const cancelTarget: View =
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
    setAttachment(buildBookPostAttachment({
      bookId: attachedBookId,
      titleEn: attachedBook.titleEn,
      titleAr: attachedBook.titleAr,
      authorEn: attachedBook.authorEn,
      authorAr: attachedBook.authorAr,
      coverUrl: attachedBook.coverUrl,
    }));
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
    setAttachment(buildPublicationPostAttachment({
      publicationId: attachedPublicationId,
      title: attachedPublication.title,
      coverUrl: attachedPublication.coverUrl,
      canonicalSlug: attachedPublication.canonicalSlug,
    }));
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

    let createAttachments;
    try {
      createAttachments = attachment ? [toPostCreateAttachmentDTO(attachment)] : [];
    } catch (error) {
      console.error('[POST_COMPOSER][ATTACHMENT_CREATE_DTO_FAILED]', {
        error: String(error),
        attachment,
      });
      showToast(lang === 'en' ? 'Invalid attachment' : 'مرفق غير صالح');
      return;
    }

    const structuredTypes = new Set(['book', 'author', 'quote', 'shelf', 'venue', 'publication']);
    const structuredAttachment =
      createAttachments.length > 0 &&
      typeof createAttachments[0].type === 'string' &&
      structuredTypes.has(createAttachments[0].type.toLowerCase()) &&
      'entityId' in createAttachments[0]
        ? (createAttachments[0] as {
            type: string;
            entityId?: string;
          })
        : null;
    const structuredEntityId = structuredAttachment
      ? (typeof structuredAttachment.entityId === 'string' && structuredAttachment.entityId.trim()) || ''
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
        attachments: createAttachments,
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
  const editorMetaParts = [
    footerDraftLabel,
    `${text.length}/${TEXT_LIMIT}`,
  ].filter(Boolean);

  return (
    <div className="h-screen bg-[#0f172a] text-white flex flex-col">
      <div className="app-frame__inner h-full">
        <div className="mx-auto flex h-full w-full max-w-[var(--app-rail-wide)] flex-col bg-[#0f172a]/86 backdrop-blur-sm md:border-x md:border-white/6 md:shadow-[0_24px_72px_-48px_rgba(0,0,0,0.9)]">
          <header className="border-b border-white/5">
            <ContentRail variant="default" className="flex h-16 items-center justify-between px-0">
              <button
                onClick={() => setShowCancelPrompt(true)}
                disabled={isDeletingDraft || !!exitAction}
                className="rounded-full px-3 py-2 text-sm text-white/72 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                {isDraftAvailable && (
                  <button
                    onClick={handleOpenDrafts}
                    className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    Drafts
                  </button>
                )}
                <Button
                  onClick={handlePublish}
                  disabled={isPosting || isUploading || isRouteDraftLoading}
                  className="min-w-[76px]"
                >
                  {isPosting ? <LoadingSpinner /> : 'Post'}
                </Button>
              </div>
            </ContentRail>
          </header>

          <div className="border-b border-white/5">
            <ContentRail variant="default" className="grid grid-cols-3 gap-3 py-4 px-0 sm:grid-cols-6">
              {attachmentTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={type.action}
                  className="flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.045] px-2 py-3 text-white/78 transition-colors hover:border-white/[0.11] hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isRouteDraftLoading}
                >
                  <type.icon className="h-5 w-5" />
                  <span className="text-[11px] font-medium">{type.label}</span>
                </button>
              ))}
            </ContentRail>
          </div>

          <ContentRail variant="default" className="min-h-0 flex-1 overflow-y-auto px-0 py-5">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-4">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, TEXT_LIMIT))}
                placeholder="What's happening?"
                rows={4}
                className="min-h-[132px] w-full resize-none bg-transparent text-2xl font-serif leading-snug text-white placeholder:text-white/34 focus:outline-none"
                disabled={isRouteDraftLoading}
              />
              <div className="mt-3 flex items-center justify-end border-t border-white/[0.06] pt-3">
                <span
                  className={cn(
                    'text-xs font-medium text-white/38',
                    TEXT_LIMIT - text.length < 50 && 'text-amber-300/90'
                  )}
                >
                  {editorMetaParts.join(' • ')}
                </span>
              </div>
            </div>

            {attachment && (
              <div className="pb-5 pt-2">
                <AttachmentListV1
                  attachments={[attachment]}
                  onRemove={() => setAttachment(null)}
                  surface="write"
                />
              </div>
            )}
          </ContentRail>
        </div>
      </div>

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
          setAttachment(buildBookPostAttachment({
            bookId: book.id,
            titleEn: book.titleEn,
            titleAr: book.titleAr,
            authorEn: book.authorEn,
            authorAr: book.authorAr,
            coverUrl: book.coverUrl,
            rating: book.rating,
          }))
        }
      />
      <AttachAuthorModal
        isOpen={modals.author}
        onClose={() => setModals((current) => ({ ...current, author: false }))}
        onSelect={(author) =>
          setAttachment(buildAuthorPostAttachment({
            authorId: author.id,
            nameEn: author.nameEn,
            nameAr: author.nameAr,
            avatarUrl: author.avatarUrl,
            countryEn: author.countryEn,
            countryAr: author.countryAr,
            signatureQuote: author.signatureQuoteEn || author.signatureQuoteAr,
          }))
        }
      />
      <AttachShelfModal
        isOpen={modals.shelf}
        onClose={() => setModals((current) => ({ ...current, shelf: false }))}
        onSelect={(shelf) =>
          setAttachment(buildShelfPostAttachment({
            shelfId: shelf.id,
            ownerId: shelf.ownerId,
            titleEn: shelf.titleEn,
            titleAr: shelf.titleAr,
            bookCount: Array.isArray(shelf.bookIds) ? shelf.bookIds.length : 0,
          }))
        }
      />
      <AttachQuoteModal
        isOpen={modals.quote}
        onClose={() => setModals((current) => ({ ...current, quote: false }))}
        onSelect={(quote) => {
          const card = QuoteCardDataAdapter.fromQuote(quote);
          const canonicalQuoteId = card.canonicalQuoteId || card.id;
          setAttachment(buildQuotePostAttachment({
            quoteId: canonicalQuoteId,
            quoteOwnerId: card.ownerId,
            quoteText: card.textEn || card.textAr,
          }));
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
        <div className="space-y-5">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {lang === 'en' ? 'Discard post?' : 'تجاهل المنشور؟'}
            </h2>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {canSaveDraftOnExit && (
              <Button
                onClick={() => void handleSaveDraftAndExit()}
                disabled={!!exitAction || isDeletingDraft}
                className="w-full"
              >
                {exitAction === 'save'
                  ? <LoadingSpinner />
                  : (lang === 'en' ? 'Save draft' : 'حفظ المسودة')}
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
