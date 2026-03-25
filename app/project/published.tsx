import React, { useMemo } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import Button from '../../components/ui/Button.tsx';
import { EyeIcon } from '../../components/icons/EyeIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { ShareIcon } from '../../components/icons/ShareIcon.tsx';
import { DuplicateIcon } from '../../components/icons/DuplicateIcon.tsx';
import { ChatIcon } from '../../components/icons/ChatIcon.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { useToast } from '../../store/toast.tsx';
import GlassCard from '../../components/ui/GlassCard.tsx';
import { buildPublicationSlugPath } from '../../lib/publications/publicationUrl.ts';

const ProjectPublishedScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();

    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;
    const releaseId = currentView.type === 'immersive' && typeof currentView.params?.releaseId === 'string'
        ? currentView.params.releaseId
        : '';
    const publishTarget = currentView.type === 'immersive' &&
        (currentView.params?.publishTarget === 'blog' || currentView.params?.publishTarget === 'ebook')
        ? currentView.params.publishTarget
        : undefined;
    const bookId = currentView.type === 'immersive' && typeof currentView.params?.bookId === 'string'
        ? currentView.params.bookId
        : '';
    const publicationId = currentView.type === 'immersive' && typeof currentView.params?.publicationId === 'string'
        ? currentView.params.publicationId
        : '';
    const canonicalSlug = currentView.type === 'immersive' && typeof currentView.params?.canonicalSlug === 'string'
        ? currentView.params.canonicalSlug
        : '';
    const publicationVersion = currentView.type === 'immersive' && typeof currentView.params?.publicationVersion === 'number'
        ? currentView.params.publicationVersion
        : 1;
    const title = currentView.type === 'immersive' && typeof currentView.params?.title === 'string'
        ? currentView.params.title
        : (lang === 'en' ? 'Published Work' : 'عمل منشور');
    const coverUrl = currentView.type === 'immersive' && typeof currentView.params?.coverUrl === 'string'
        ? currentView.params.coverUrl
        : undefined;

    const handleBack = () => {
        navigate({ type: 'tab', id: 'write' });
    };

    const shareUrl = useMemo(() => {
        if (publishTarget === 'ebook' && bookId) {
            return typeof window !== 'undefined'
                ? `${window.location.origin}/reader/${encodeURIComponent(bookId)}`
                : `/reader/${encodeURIComponent(bookId)}`;
        }

        if (publishTarget === 'blog' && publicationId) {
            const path = buildPublicationSlugPath(title, publicationId, canonicalSlug);
            return typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
        }

        return '';
    }, [bookId, canonicalSlug, publicationId, publishTarget, title]);

    const handlePrimaryAction = () => {
        if (publishTarget === 'ebook' && bookId) {
            navigate({ type: 'immersive', id: 'reader', params: { bookId } });
            return;
        }

        if (publishTarget === 'blog' && publicationId) {
            navigate({
                type: 'immersive',
                id: 'publicationReader',
                params: {
                    publicationId,
                    title,
                    ...(canonicalSlug ? { canonicalSlug } : {}),
                    from: currentView,
                },
            });
            return;
        }

        showToast(
            lang === 'en'
                ? 'Published work is ready, but the next destination is unavailable.'
                : 'العمل المنشور جاهز، لكن الوجهة التالية غير متاحة.'
        );
    };

    const handleCopyLink = async () => {
        if (!shareUrl) {
            showToast(lang === 'en' ? 'No link available yet.' : 'لا يوجد رابط متاح بعد.');
            return;
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showToast(lang === 'en' ? 'Link copied to clipboard' : 'تم نسخ الرابط');
            return;
        }

        showToast(shareUrl);
    };

    const handleShare = () => {
        if (!shareUrl) {
            showToast(lang === 'en' ? 'No share link available yet.' : 'لا يوجد رابط مشاركة متاح بعد.');
            return;
        }

        navigate({
            type: 'immersive',
            id: 'postComposer',
            params: {
                from: currentView,
                prefillText: title,
                ...(publishTarget === 'blog' && publicationId
                    ? {
                        attachedPublication: {
                            id: publicationId,
                            title,
                            ...(coverUrl ? { coverUrl } : {}),
                            ...(canonicalSlug ? { canonicalSlug } : {}),
                        },
                    }
                    : {}),
                ...(publishTarget === 'ebook' && bookId
                    ? { attachedBook: { id: bookId } }
                    : {}),
            },
        });
    };

    const handleDm = () => {
        if ((publishTarget === 'blog' && !publicationId) || (publishTarget === 'ebook' && !bookId)) {
            showToast(lang === 'en' ? 'No message attachment available yet.' : 'لا يوجد مرفق رسالة متاح بعد.');
            return;
        }

        navigate({
            type: 'immersive',
            id: 'messengerList',
            params: {
                from: currentView,
                ...(title ? { prefillText: title } : {}),
                ...(publishTarget === 'blog' && publicationId
                    ? {
                        attachedPublication: {
                            id: publicationId,
                            title,
                            ...(coverUrl ? { coverUrl } : {}),
                            ...(canonicalSlug ? { canonicalSlug } : {}),
                        },
                    }
                    : {}),
                ...(publishTarget === 'ebook' && bookId
                    ? { attachedBook: { id: bookId } }
                    : {}),
            },
        });
    };

    if (!publishTarget || !releaseId || !projectId) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900 text-white">
                <BilingualText>No publication data found.</BilingualText>
                <Button onClick={handleBack} className="ml-4">Back</Button>
            </div>
        );
    }

    const isRepublish = publicationVersion > 1;

    const subtitleText =
        isRepublish
            ? (lang === 'en' ? 'Your latest version is now live.' : 'أصبح أحدث إصدار لك متاحاً الآن.')
            : publishTarget === 'ebook'
                ? (lang === 'en'
                    ? 'Your ebook is now available in BookTown Reader.'
                    : 'أصبح كتابك الإلكتروني متاحاً الآن داخل قارئ بوك تاون.')
                : (lang === 'en'
                    ? 'Your publication is now live in BookTown.'
                    : 'أصبح منشورك متاحاً الآن داخل بوك تاون.');

    return (
        <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-slate-900 p-6">
            <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(113,255,185,0.14),_transparent_40%),radial-gradient(circle_at_top,_rgba(196,165,121,0.18),_transparent_45%),linear-gradient(180deg,_#111827_0%,_#0f172a_100%)]" />
            <button
                type="button"
                onClick={handleBack}
                className="absolute left-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/80 transition hover:bg-white/12 hover:text-white"
                aria-label={lang === 'en' ? 'Back' : 'رجوع'}
            >
                <ChevronLeftIcon className="h-5 w-5" />
            </button>

            <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
                <div className="relative mb-8 h-28 w-28">
                    <div className="absolute inset-0 rounded-full bg-emerald-400/12 blur-3xl" />
                </div>

                <BilingualText role="H1" className="!mb-2 !text-4xl !text-white text-center drop-shadow-lg">
                    {isRepublish
                        ? (lang === 'en' ? 'Published Updated' : 'تم تحديث النشر')
                        : (lang === 'en' ? 'Published!' : 'تم النشر!')}
                </BilingualText>

                <BilingualText role="Body" className="mb-8 text-center text-white/70">
                    {subtitleText}
                </BilingualText>

                <GlassCard className="mb-8 flex w-full flex-col items-center border border-white/10 bg-white/5 p-6">
                    <div className="mb-4 h-48 w-32 overflow-hidden rounded bg-slate-800 shadow-2xl">
                        {coverUrl ? (
                            <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <BookIcon className="h-10 w-10 text-white/20" />
                            </div>
                        )}
                    </div>

                    <BilingualText role="H2" className="!text-xl text-center">{title}</BilingualText>
                    <BilingualText role="Caption" className="mt-1 text-center">
                        {publishTarget === 'ebook' ? 'Ebook' : 'Blog'}
                    </BilingualText>
                </GlassCard>

                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                    <Button variant="primary" onClick={handlePrimaryAction} className="w-full">
                        <EyeIcon className="mr-2 h-5 w-5" />
                        {publishTarget === 'ebook'
                            ? (lang === 'en' ? 'Open In Reader' : 'فتح في القارئ')
                            : (lang === 'en' ? 'Open Publication' : 'فتح المنشور')}
                    </Button>
                    <Button variant="secondary" onClick={handleShare} className="w-full">
                        <ShareIcon className="mr-2 h-5 w-5" />
                        {lang === 'en' ? 'Share' : 'مشاركة'}
                    </Button>
                    <Button variant="ghost" onClick={() => void handleCopyLink()} className="w-full border border-white/10 bg-white/10 text-white hover:bg-white/20">
                        <DuplicateIcon className="mr-2 h-5 w-5" />
                        {lang === 'en' ? 'Copy Link' : 'نسخ الرابط'}
                    </Button>
                    <Button variant="ghost" onClick={handleDm} className="w-full border border-white/10 bg-white/10 text-white hover:bg-white/20">
                        <ChatIcon className="mr-2 h-5 w-5" />
                        {lang === 'en' ? 'DM' : 'رسالة'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ProjectPublishedScreen;
