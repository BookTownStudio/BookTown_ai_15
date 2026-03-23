import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useToast } from '../../store/toast.tsx';
import { useDebounce } from 'use-debounce';
import { motion, AnimatePresence } from 'framer-motion';

import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import Modal from '../../components/ui/Modal.tsx';

import {
  XIcon,
  BookIcon,
  QuoteIcon,
  MediaIcon,
  ShelvesIcon,
  AuthorsIcon,
  GlobeIcon,
  UsersIcon,
  LockIcon,
  TrashIcon,
  // FIX: Replaced non-existent LocationIcon with MapPinIcon which is exported in components/icons
  MapPinIcon
} from '../../components/icons';

import SelectBookModal from '../../components/modals/SelectBookModal.tsx';
import AttachAuthorModal from '../../components/modals/AttachAuthorModal.tsx';
import AttachShelfModal from '../../components/modals/AttachShelfModal.tsx';
import AttachQuoteModal from '../../components/modals/AttachQuoteModal.tsx';

import { PostAttachment, PostVisibilityScope } from '../../types/entities.ts';
import { AttachmentListV1 } from '../../components/content/AttachmentRendererV1.tsx';
import { useAttachmentUpload } from '../../lib/hooks/useAttachmentUpload.ts';
import { useCreatePost } from '../../lib/hooks/useCreatePost.ts';
import { cn } from '../../lib/utils.ts';

const TEXT_LIMIT = 500;
const DRAFTS_KEY = 'booktown_drafts_v2';
const AUTOSAVE_DEBOUNCE = 800;

interface PostDraftV2 {
  id: string;
  text: string;
  visibility: PostVisibilityScope;
  attachment: PostAttachment | null;
  updatedAt: string;
  createdAt: string;
}

const PostComposerScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang, isRTL } = useI18n();
  const { user, isGuest } = useAuth();
  const { showToast } = useToast();

  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PostAttachment | null>(null);
  const [visibility, setVisibility] = useState<PostVisibilityScope>('public');
  const [drafts, setDrafts] = useState<PostDraftV2[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modals, setModals] = useState({ book: false, author: false, shelf: false, quote: false });

  const { upload, isUploading } = useAttachmentUpload();
  const { mutate: createPost, isLoading: isPosting } = useCreatePost();

  const [debouncedText] = useDebounce(text, AUTOSAVE_DEBOUNCE);
  const [debouncedVisibility] = useDebounce(visibility, AUTOSAVE_DEBOUNCE);
  const [debouncedAttachment] = useDebounce(attachment, AUTOSAVE_DEBOUNCE);
  const attachedBookRef = useRef<string>('');
  const attachedPublicationRef = useRef<string>('');
  const prefillTextRef = useRef<string>('');

  useEffect(() => {
    const stored = localStorage.getItem(DRAFTS_KEY);
    if (stored) setDrafts(JSON.parse(stored));
  }, []);

  useEffect(() => {
    const prefillText =
      currentView.type === 'immersive' &&
      currentView.id === 'postComposer' &&
      typeof currentView.params?.prefillText === 'string'
        ? currentView.params.prefillText.trim()
        : '';

    if (!prefillText || prefillTextRef.current === prefillText || text.trim()) return;

    prefillTextRef.current = prefillText;
    setText(prefillText);
  }, [currentView, text]);

  useEffect(() => {
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

    if (!attachedBookId) return;
    if (attachedBookRef.current === attachedBookId) return;

    attachedBookRef.current = attachedBookId;
    setAttachment({
      type: 'book',
      entityId: attachedBookId,
      bookId: attachedBookId,
    } as PostAttachment);
    showToast(lang === 'en' ? 'Book attached.' : 'تم إرفاق الكتاب.');
  }, [currentView, lang, showToast]);

  useEffect(() => {
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

    if (!attachedPublicationId) return;
    if (attachedPublicationRef.current === attachedPublicationId) return;

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
  }, [currentView, lang, showToast]);

  useEffect(() => {
    if (!debouncedText.trim() && !debouncedAttachment) return;
    setIsAutosaving(true);

    const now = new Date().toISOString();
    const id = activeDraftId || crypto.randomUUID();

    const draft: PostDraftV2 = {
      id,
      text: debouncedText,
      visibility: debouncedVisibility,
      attachment: debouncedAttachment,
      updatedAt: now,
      createdAt: drafts.find(d => d.id === id)?.createdAt || now
    };

    const updated = activeDraftId
      ? drafts.map(d => d.id === id ? draft : d)
      : [draft, ...drafts];

    localStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
    setDrafts(updated);
    if (!activeDraftId) setActiveDraftId(id);

    setTimeout(() => setIsAutosaving(false), 500);
  }, [debouncedText, debouncedVisibility, debouncedAttachment]);

  const handlePublish = () => {
    if (isGuest || isPosting || isUploading) return;
    if (!text.trim() && !attachment) {
      showToast(lang === 'en' ? 'Empty post' : 'منشور فارغ');
      return;
    }

    const structuredTypes = new Set(['book', 'author', 'quote', 'shelf', 'venue', 'publication']);
    const structuredAttachment =
      attachment &&
      typeof (attachment as { type?: unknown }).type === 'string' &&
      structuredTypes.has(String((attachment as { type?: unknown }).type).toLowerCase())
        ? (attachment as { type: string; entityId?: string; bookId?: string; authorId?: string; quoteId?: string; shelfId?: string; venueId?: string; publicationId?: string })
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

    createPost({
      content: { text: text.trim() },
      attachments: attachment ? [attachment] : [],
      visibility,
      publishToken: crypto.randomUUID()
    }, {
      onSuccess: (createdPost: any) => {
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
        showToast(lang === 'en' ? 'Published' : 'تم النشر');
        navigate(currentView.params?.from || { type: 'tab', id: 'social' });
      }
    });
  };

  const attachmentTypes = [
    { id: 'book', icon: BookIcon, label: 'Book', action: () => setModals(m => ({ ...m, book: true })) },
    { id: 'author', icon: AuthorsIcon, label: 'Author', action: () => setModals(m => ({ ...m, author: true })) },
    { id: 'shelf', icon: ShelvesIcon, label: 'Shelf', action: () => setModals(m => ({ ...m, shelf: true })) },
    { id: 'quote', icon: QuoteIcon, label: 'Quote', action: () => setModals(m => ({ ...m, quote: true })) },
    // FIX: Replaced LocationIcon with MapPinIcon
    { id: 'venue', icon: MapPinIcon, label: 'Venue', action: () => showToast('Venue coming soon') },
    { id: 'media', icon: MediaIcon, label: 'Media', action: () => fileInputRef.current?.click() }
  ];

  return (
    <div className="h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-16 border-b border-white/5">
        <button onClick={() => setShowCancelPrompt(true)}>Cancel</button>
        <div className="flex gap-2">
          {drafts.length > 0 && (
            <button onClick={() => setShowDrafts(true)} className="px-3 py-1 text-xs rounded-full bg-white/5">
              Drafts
            </button>
          )}
          <Button onClick={handlePublish} disabled={isPosting || isUploading}>
            {isPosting ? <LoadingSpinner /> : 'Post'}
          </Button>
        </div>
      </header>

      {/* INLINE ATTACHMENT SELECTOR (LOCKED) */}
      <div className="grid grid-cols-6 gap-2 px-4 py-4 border-b border-white/5">
        {attachmentTypes.map(t => (
          <button
            key={t.id}
            onClick={t.action}
            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-white/5 hover:bg-white/10"
          >
            <t.icon className="h-6 w-6" />
            <span className="text-[10px]">{t.label}</span>
          </button>
        ))}
      </div>

      {/* TEXT */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, TEXT_LIMIT))}
        placeholder="What's happening?"
        className="flex-grow px-6 py-6 bg-transparent text-2xl font-serif resize-none focus:outline-none"
      />

      {attachment && (
        <div className="px-6 pb-4">
          <AttachmentListV1 attachments={[attachment]} onRemove={() => setAttachment(null)} surface="write" />
        </div>
      )}

      {/* FOOTER */}
      <footer className="h-14 px-4 flex items-center justify-between border-t border-white/5">
        {isAutosaving && <span className="text-xs opacity-40">Draft saved</span>}
        <span className={cn('text-xs', TEXT_LIMIT - text.length < 50 && 'text-amber-400')}>
          {TEXT_LIMIT - text.length} / {TEXT_LIMIT}
        </span>
      </footer>

      <input
        type="file"
        ref={fileInputRef}
        hidden
        accept="image/*"
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const att = await upload({ file, type: 'IMAGE', parentId: 'draft', parentType: 'drafts' });
          if (att) setAttachment(att);
        }}
      />

      <SelectBookModal
        isOpen={modals.book}
        onClose={() => setModals(m => ({ ...m, book: false }))}
        onBookSelect={(b) => setAttachment({ type: 'book', entityId: b.id, bookId: b.id } as PostAttachment)}
      />
      <AttachAuthorModal
        isOpen={modals.author}
        onClose={() => setModals(m => ({ ...m, author: false }))}
        onSelect={(a) => setAttachment({ type: 'author', entityId: a.id, authorId: a.id } as PostAttachment)}
      />
      <AttachShelfModal
        isOpen={modals.shelf}
        onClose={() => setModals(m => ({ ...m, shelf: false }))}
        onSelect={(s) => setAttachment({ type: 'shelf', entityId: s.id, shelfId: s.id } as PostAttachment)}
      />
      <AttachQuoteModal
        isOpen={modals.quote}
        onClose={() => setModals(m => ({ ...m, quote: false }))}
        onSelect={(q) => setAttachment({ type: 'quote', entityId: q.id, quoteId: q.id, quoteOwnerId: q.ownerId } as PostAttachment)}
      />

      <Modal isOpen={showCancelPrompt} onClose={() => setShowCancelPrompt(false)}>
        <Button onClick={() => navigate({ type: 'tab', id: 'social' })}>Discard</Button>
      </Modal>
    </div>
  );
};

export default PostComposerScreen;
