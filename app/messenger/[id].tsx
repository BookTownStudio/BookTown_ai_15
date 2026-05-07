import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useToast } from '../../store/toast.tsx';
import {
    useChatHistory,
    useSendMessage,
    useMarkConversationRead,
    createMessageIdempotencyKey
} from '../../lib/hooks/useMessenger.ts';
import { useAuth } from '../../lib/auth.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { DirectMessage, PostAttachment } from '../../types/entities.ts';
import Button from '../../components/ui/Button.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { SendIcon } from '../../components/icons/SendIcon.tsx';
import { PaperclipIcon } from '../../components/icons/PaperclipIcon.tsx';
import { AttachmentListV1 } from '../../components/content/AttachmentRendererV1.tsx';
import Modal from '../../components/ui/Modal.tsx';
import SelectBookModal from '../../components/modals/SelectBookModal.tsx';
import AttachQuoteModal from '../../components/modals/AttachQuoteModal.tsx';
import SelectPublicationModal from '../../components/modals/SelectPublicationModal.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { QuoteIcon } from '../../components/icons/QuoteIcon.tsx';
import type { Quote } from '../../types/entities.ts';
import GlassCard from '../../components/ui/GlassCard.tsx';

type ComposerAttachment = NonNullable<DirectMessage['attachment']>;
type OptimisticDeliveryState = 'sending' | 'sent';
type OptimisticDirectMessage = DirectMessage & {
    deliveryState: OptimisticDeliveryState;
    optimisticKey: string;
};

const toRenderableDmAttachment = (
    attachment: DirectMessage['attachment']
): PostAttachment | null => {
    if (!attachment) return null;
    if (attachment.type === 'book') {
        return {
            type: 'book',
            bookId: attachment.entityId,
            bookTitle: attachment.title || 'Book',
            bookAuthor: attachment.author || '',
            bookCover: attachment.coverUrl || '',
            bookRating: 0,
        };
    }
    if (attachment.type === 'publication') {
        return {
            type: 'publication',
            publicationId: attachment.entityId,
            title: attachment.title || 'Publication',
            ...(attachment.author ? { author: attachment.author } : {}),
            ...(attachment.coverUrl ? { coverUrl: attachment.coverUrl } : {}),
            ...(attachment.canonicalSlug ? { canonicalSlug: attachment.canonicalSlug } : {}),
        };
    }
    return null;
};

const isCanonicalQuoteId = (value: string | undefined): boolean =>
    typeof value === 'string' && /^cq_[A-Za-z0-9_-]+$/.test(value.trim());

const QuoteAttachmentCard: React.FC<{
    attachment: NonNullable<DirectMessage['attachment']>;
    onOpen: () => void;
}> = ({ attachment, onOpen }) => (
    <button type="button" onClick={onOpen} className="block w-full text-left">
        <GlassCard className="!p-3 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-accent/10 p-2 text-accent">
                    <QuoteIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <BilingualText className="font-semibold">
                        Quote
                    </BilingualText>
                    {attachment.quoteText ? (
                        <BilingualText role="Quote" className="mt-1 !text-sm line-clamp-3">
                            "{attachment.quoteText}"
                        </BilingualText>
                    ) : null}
                </div>
            </div>
        </GlassCard>
    </button>
);

const ChatBubble: React.FC<{
    message: DirectMessage | OptimisticDirectMessage;
    isMe: boolean;
}> = ({ message, isMe }) => {
    const { isRTL, lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const renderableAttachment = toRenderableDmAttachment(message.attachment);
    const handleOpenQuoteAttachment = () => {
        if (!message.attachment || message.attachment.type !== 'quote') {
            return;
        }

        const quoteId = message.attachment.entityId.trim();
        if (!quoteId) {
            return;
        }

        const params: Record<string, unknown> = {
            quoteId,
            from: currentView,
        };
        if (!isCanonicalQuoteId(quoteId) && message.attachment.quoteOwnerId) {
            params.ownerId = message.attachment.quoteOwnerId;
        }

        navigate({
            type: 'immersive',
            id: 'quoteDetails',
            params,
        });
    };
    const deliveryLabel = !isMe
        ? ''
        : 'deliveryState' in message && message.deliveryState === 'sending'
            ? (lang === 'en' ? 'Sending' : 'جارٍ الإرسال')
            : message.readByPeer
                ? (lang === 'en' ? 'Seen' : 'تمت المشاهدة')
                : (lang === 'en' ? 'Sent' : 'تم الإرسال');
    return (
        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-md lg:max-w-lg px-4 py-3 rounded-2xl shadow-sm ${isMe ? 'bg-gradient-to-br from-primary to-sky-500 text-white rounded-br-lg' : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white/90 rounded-bl-lg'}`}>
                {message.text ? (
                    <p className={`${isRTL ? 'text-right' : 'text-left'} leading-relaxed`}>{message.text}</p>
                ) : null}
                {message.attachment?.type === 'quote' ? (
                    <div className={message.text ? 'mt-3' : ''}>
                        <QuoteAttachmentCard
                            attachment={message.attachment}
                            onOpen={handleOpenQuoteAttachment}
                        />
                    </div>
                ) : renderableAttachment ? (
                    <div className={message.text ? 'mt-3' : ''}>
                        <AttachmentListV1 attachments={[renderableAttachment]} surface="read" />
                    </div>
                ) : null}
                {isMe && (
                    <p className={`mt-1 text-[11px] ${isRTL ? 'text-right' : 'text-left'} ${isMe ? 'text-white/80' : 'text-slate-500'}`}>
                        {deliveryLabel}
                    </p>
                )}
            </div>
        </div>
    );
};


const MessengerChatScreen: React.FC = () => {
    const { lang, isRTL } = useI18n();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { navigate, currentView } = useNavigation();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastReadMarkerRef = useRef<string | null>(null);
    const prefillAppliedRef = useRef<string>('');
    const attachedEntityAppliedRef = useRef<string>('');
    const [optimisticMessages, setOptimisticMessages] = useState<OptimisticDirectMessage[]>([]);
    const [input, setInput] = useState('');
    const [attachment, setAttachment] = useState<ComposerAttachment>();
    const [isAttachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
    const [isBookPickerOpen, setBookPickerOpen] = useState(false);
    const [isPublicationPickerOpen, setPublicationPickerOpen] = useState(false);
    const [isQuotePickerOpen, setQuotePickerOpen] = useState(false);
    
    const conversationId = currentView.type === 'immersive' ? currentView.params?.conversationId : undefined;
    const contactName = currentView.type === 'immersive' ? currentView.params?.contactName : 'Chat';
    const prefillText =
        currentView.type === 'immersive' && typeof currentView.params?.prefillText === 'string'
            ? currentView.params.prefillText.trim()
            : '';
    const attachedBook =
        currentView.type === 'immersive' &&
        currentView.params &&
        typeof currentView.params?.attachedBook === 'object'
            ? (currentView.params.attachedBook as Record<string, unknown>)
            : null;
    const attachedPublication =
        currentView.type === 'immersive' &&
        currentView.params &&
        typeof currentView.params?.attachedPublication === 'object'
            ? (currentView.params.attachedPublication as Record<string, unknown>)
            : null;
    const attachedQuote =
        currentView.type === 'immersive' &&
        currentView.params &&
        typeof currentView.params?.attachedQuote === 'object'
            ? (currentView.params.attachedQuote as Record<string, unknown>)
            : null;

    const { data: messages, isLoading, isError } = useChatHistory(conversationId);
    const sendMutation = useSendMessage(conversationId);
    const markReadMutation = useMarkConversationRead();
    const isSending = sendMutation.isPending;
    const normalizedInput = input.trim();
    const canSend = Boolean(conversationId) && (normalizedInput.length > 0 || attachment) && !isSending;
    const combinedMessages = useMemo(() => {
        const merged = [...optimisticMessages, ...(messages || [])];
        const byId = new Map<string, DirectMessage | OptimisticDirectMessage>();
        for (const message of merged) {
            byId.set(message.id, message);
        }
        return Array.from(byId.values()).sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    }, [messages, optimisticMessages]);

    const handleBack = () => navigate(currentView.params?.from || { type: 'immersive', id: 'messengerList' });

    const handleSend = () => {
        if (!canSend) return;
        const idempotencyKey = createMessageIdempotencyKey();
        const optimisticId = `pending_${idempotencyKey}`;
        const optimisticMessage: OptimisticDirectMessage = {
            id: optimisticId,
            senderId: user?.uid || 'unknown',
            text: normalizedInput,
            ...(attachment ? { attachment } : {}),
            timestamp: new Date().toISOString(),
            deliveryState: 'sending',
            optimisticKey: optimisticId,
        };

        setOptimisticMessages((current) => [...current, optimisticMessage]);

        sendMutation.mutate(
            {
                text: normalizedInput,
                idempotencyKey,
                ...(attachment
                    ? {
                        attachment: {
                            type: attachment.type,
                            entityId: attachment.entityId,
                        },
                    }
                    : {}),
            },
            {
                onSuccess: ({ messageId }) => {
                    setOptimisticMessages((current) =>
                        current.map((message) =>
                            message.optimisticKey === optimisticId
                                ? {
                                    ...message,
                                    id: messageId,
                                    deliveryState: 'sent',
                                  }
                                : message
                        )
                    );
                    setInput('');
                    setAttachment(undefined);
                },
                onError: () => {
                    setOptimisticMessages((current) =>
                        current.filter((message) => message.optimisticKey !== optimisticId)
                    );
                    showToast(
                        lang === 'en'
                            ? 'Failed to send message. Please retry.'
                            : 'فشل إرسال الرسالة. حاول مرة أخرى.'
                    );
                },
            }
        );
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [combinedMessages]);

    useEffect(() => {
        if (!messages || messages.length === 0) return;
        const persistedIds = new Set(messages.map((message) => message.id));
        setOptimisticMessages((current) =>
            current.filter((message) => !persistedIds.has(message.id))
        );
    }, [messages]);

    useEffect(() => {
        if (!prefillText || input.trim() || prefillAppliedRef.current === prefillText) {
            return;
        }

        prefillAppliedRef.current = prefillText;
        setInput(prefillText);
    }, [input, prefillText]);

    useEffect(() => {
        const bookId =
            attachedBook && typeof attachedBook.id === 'string'
                ? attachedBook.id.trim()
                : '';
        const publicationId =
            attachedPublication && typeof attachedPublication.id === 'string'
                ? attachedPublication.id.trim()
                : '';
        const nextKey = publicationId
            ? `publication:${publicationId}`
            : bookId
                ? `book:${bookId}`
                : '';

        if (!nextKey || attachedEntityAppliedRef.current === nextKey) {
            return;
        }

        attachedEntityAppliedRef.current = nextKey;
        if (publicationId) {
            setAttachment({
                type: 'publication',
                entityId: publicationId,
                title:
                    typeof attachedPublication?.title === 'string'
                        ? attachedPublication.title.trim()
                        : undefined,
                coverUrl:
                    typeof attachedPublication?.coverUrl === 'string'
                        ? attachedPublication.coverUrl.trim()
                        : undefined,
                canonicalSlug:
                    typeof attachedPublication?.canonicalSlug === 'string'
                        ? attachedPublication.canonicalSlug.trim()
                        : undefined,
            });
            return;
        }

        if (bookId) {
            setAttachment({
                type: 'book',
                entityId: bookId,
            });
        }
    }, [attachedBook, attachedPublication]);

    useEffect(() => {
        const quoteId =
            attachedQuote && typeof attachedQuote.id === 'string'
                ? attachedQuote.id.trim()
                : attachedQuote && typeof attachedQuote.canonicalQuoteId === 'string'
                    ? attachedQuote.canonicalQuoteId.trim()
                : '';
        const quoteOwnerId =
            attachedQuote && typeof attachedQuote.ownerId === 'string'
                ? attachedQuote.ownerId.trim()
                : '';
        const nextKey = quoteId ? `quote:${quoteId}` : '';

        if (!nextKey || attachedEntityAppliedRef.current === nextKey) {
            return;
        }

        attachedEntityAppliedRef.current = nextKey;
        if (quoteId) {
            setAttachment({
                type: 'quote',
                entityId: quoteId,
                ...(quoteOwnerId ? { quoteOwnerId } : {}),
                quoteText:
                    typeof attachedQuote?.text === 'string'
                        ? attachedQuote.text.trim()
                        : undefined,
            });
        }
    }, [attachedQuote]);

    useEffect(() => {
        if (!conversationId || !messages || messages.length === 0) return;
        const newestMessage = messages[messages.length - 1];
        const marker = `${conversationId}:${newestMessage.id}`;
        if (lastReadMarkerRef.current === marker) return;

        lastReadMarkerRef.current = marker;
        markReadMutation.mutate(conversationId, {
            onError: () => {
                if (lastReadMarkerRef.current === marker) {
                    lastReadMarkerRef.current = null;
                }
            },
        });
    }, [conversationId, messages, markReadMutation]);

    const handleAttachmentTypeSelect = (type: 'book' | 'publication' | 'quote') => {
        setAttachmentPickerOpen(false);
        if (type === 'book') {
            setBookPickerOpen(true);
            return;
        }
        if (type === 'publication') {
            setPublicationPickerOpen(true);
            return;
        }
        setQuotePickerOpen(true);
    };

    const handleBookSelect = (book: { id: string }) => {
        setAttachment({
            type: 'book',
            entityId: book.id,
        });
        setBookPickerOpen(false);
    };

    const handlePublicationSelect = (publication: {
        publicationId: string;
        title: string;
        coverUrl?: string;
        canonicalSlug?: string;
    }) => {
        setAttachment({
            type: 'publication',
            entityId: publication.publicationId,
            title: publication.title,
            ...(publication.coverUrl ? { coverUrl: publication.coverUrl } : {}),
            ...(publication.canonicalSlug ? { canonicalSlug: publication.canonicalSlug } : {}),
        });
        setPublicationPickerOpen(false);
    };

    const handleQuoteSelect = (quote: Quote) => {
        const canonicalQuoteId = quote.canonicalQuoteId || quote.id;
        if (!canonicalQuoteId) {
            showToast(
                lang === 'en'
                    ? 'This quote is unavailable right now.'
                    : 'هذا الاقتباس غير متاح حالياً.'
            );
            return;
        }
        setAttachment({
            type: 'quote',
            entityId: canonicalQuoteId,
            ...(quote.ownerId ? { quoteOwnerId: quote.ownerId } : {}),
            quoteText: (lang === 'en' ? quote.textEn : quote.textAr) || quote.textEn,
        });
        setQuotePickerOpen(false);
    };

    return (
        <div className="h-screen w-full flex flex-col bg-gray-50 dark:bg-slate-900">
            <header className="fixed top-0 left-0 right-0 z-20 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
                <div className={`container mx-auto flex h-20 items-center justify-between px-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Button variant="ghost" onClick={handleBack}><ChevronLeftIcon className="h-6 w-6" /></Button>
                    <BilingualText role="H1" className="!text-xl">{contactName}</BilingualText>
                    <div className="w-10" />
                </div>
            </header>

            <main className="flex-grow pt-20 pb-28 overflow-y-auto">
                <div className="container mx-auto p-4 space-y-4">
                    {isLoading && <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>}
                    {isError && <BilingualText className="text-center text-red-400">Error loading messages.</BilingualText>}
                    {combinedMessages.map(msg => (
                        <ChatBubble key={msg.id} message={msg} isMe={msg.senderId === user?.uid} />
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </main>

             <footer
                className="fixed bottom-0 left-0 right-0 z-10 bg-gray-50 dark:bg-slate-900 border-t border-black/10 dark:border-white/10"
                style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
            >
                <div className="container mx-auto px-2 pt-2">
                    {attachment ? (
                        <div className="px-2 pb-2">
                            <AttachmentListV1
                                attachments={[toRenderableDmAttachment(attachment)].filter(Boolean) as PostAttachment[]}
                                surface="write"
                            />
                            <div className="mt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setAttachment(undefined)}
                                    className="text-xs text-slate-500 hover:text-slate-700 dark:text-white/55 dark:hover:text-white/80"
                                >
                                    {lang === 'en' ? 'Remove attachment' : 'إزالة المرفق'}
                                </button>
                            </div>
                        </div>
                    ) : null}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="icon"
                            className="flex-shrink-0 !text-slate-500"
                            aria-label={lang === 'en' ? 'Attach item' : 'إرفاق عنصر'}
                            onClick={() => setAttachmentPickerOpen(true)}
                        >
                            <PaperclipIcon className="h-6 w-6" />
                        </Button>
                        <input
                            type="text"
                            placeholder={lang === 'en' ? 'Type your message...' : 'اكتب رسالتك...'}
                            dir={isRTL ? 'rtl' : 'ltr'}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            disabled={isSending}
                            className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-full py-3 px-4 text-slate-900 dark:text-white/90 placeholder:text-slate-500 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <Button
                            variant="icon"
                            className="flex-shrink-0 !text-accent"
                            onClick={handleSend}
                            disabled={!canSend}
                            aria-label={lang === 'en' ? 'Send message' : 'إرسال الرسالة'}
                        >
                            <SendIcon className="h-6 w-6" />
                        </Button>
                    </div>
                </div>
            </footer>
            <Modal isOpen={isAttachmentPickerOpen} onClose={() => setAttachmentPickerOpen(false)}>
                <div className="space-y-3">
                    <BilingualText role="H1" className="!text-xl text-center mb-2">
                        {lang === 'en' ? 'Attach to message' : 'إرفاق في الرسالة'}
                    </BilingualText>
                    <button
                        type="button"
                        onClick={() => handleAttachmentTypeSelect('book')}
                        className="flex w-full items-center gap-3 rounded-2xl border border-black/5 bg-white/70 px-4 py-3 text-left transition hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                        <BookIcon className="h-5 w-5 text-accent" />
                        <span>{lang === 'en' ? 'Book' : 'كتاب'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleAttachmentTypeSelect('publication')}
                        className="flex w-full items-center gap-3 rounded-2xl border border-black/5 bg-white/70 px-4 py-3 text-left transition hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                        <BookIcon className="h-5 w-5 text-accent" />
                        <span>{lang === 'en' ? 'Publication' : 'منشور'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleAttachmentTypeSelect('quote')}
                        className="flex w-full items-center gap-3 rounded-2xl border border-black/5 bg-white/70 px-4 py-3 text-left transition hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                        <QuoteIcon className="h-5 w-5 text-accent" />
                        <span>{lang === 'en' ? 'Quote' : 'اقتباس'}</span>
                    </button>
                </div>
            </Modal>
            <SelectBookModal
                isOpen={isBookPickerOpen}
                onClose={() => setBookPickerOpen(false)}
                onBookSelect={handleBookSelect}
                selectionMode="selectCanonical"
            />
            <SelectPublicationModal
                isOpen={isPublicationPickerOpen}
                onClose={() => setPublicationPickerOpen(false)}
                onSelect={handlePublicationSelect}
            />
            <AttachQuoteModal
                isOpen={isQuotePickerOpen}
                onClose={() => setQuotePickerOpen(false)}
                onSelect={handleQuoteSelect}
            />
        </div>
    );
};

export default MessengerChatScreen;
