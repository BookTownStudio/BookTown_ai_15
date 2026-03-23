import React, { useEffect, useMemo, useState } from 'react';
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

const PUBLISH_SUCCESS_CELEBRATION_STORAGE_KEY = 'booktown:publish-success-pending';

type CelebrationPhase = 'hidden' | 'spawn' | 'arrival' | 'settle' | 'stable';

const SignaturePublishBook: React.FC<{
    phase: CelebrationPhase;
    isRepublish: boolean;
    shouldAnimate: boolean;
}> = ({ phase, isRepublish, shouldAnimate }) => {
    const transformByPhase: Record<CelebrationPhase, string> = {
        hidden: 'translate3d(0,-24px,0) rotateY(-10deg) scale(0.7)',
        spawn: 'translate3d(0,-18px,0) rotateY(-8deg) scale(0.78)',
        arrival: isRepublish
            ? 'translate3d(0,-5px,0) rotateY(-4deg) scale(0.94)'
            : 'translate3d(0,-2px,0) rotateY(-5deg) scale(0.94)',
        settle: isRepublish
            ? 'translate3d(0,0,0) rotateY(-1deg) scale(1.04)'
            : 'translate3d(0,0,0) rotateY(-1deg) scale(1.08)',
        stable: 'translate3d(0,0,0) rotateY(0deg) scale(1)',
    };

    const reflectionTransformByPhase: Record<CelebrationPhase, string> = {
        hidden: 'translateX(-135%) rotate(14deg)',
        spawn: 'translateX(-118%) rotate(14deg)',
        arrival: 'translateX(-30%) rotate(14deg)',
        settle: 'translateX(38%) rotate(14deg)',
        stable: 'translateX(132%) rotate(14deg)',
    };

    const glowOpacity =
        phase === 'hidden'
            ? 0.18
            : phase === 'spawn'
                ? 0.26
                : phase === 'arrival'
                    ? (isRepublish ? 0.3 : 0.38)
                    : phase === 'settle'
                        ? (isRepublish ? 0.34 : 0.45)
                        : 0.22;

    return (
        <div className="relative mb-8 flex h-40 w-40 items-center justify-center [perspective:1200px]">
            <div
                className="absolute inset-0 rounded-full blur-3xl transition-all ease-out"
                style={{
                    background:
                        'radial-gradient(circle, rgba(52,211,153,0.55) 0%, rgba(16,185,129,0.22) 38%, rgba(16,185,129,0) 72%)',
                    opacity: glowOpacity,
                    transform: phase === 'settle' ? 'scale(1.12)' : 'scale(0.96)',
                    transitionDuration: shouldAnimate ? '420ms' : '0ms',
                }}
            />
            <div
                className="relative h-[88px] w-[64px] transition-all ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                    opacity: phase === 'hidden' ? 0 : 1,
                    transform: transformByPhase[phase],
                    transformStyle: 'preserve-3d',
                    transitionDuration: shouldAnimate ? (isRepublish ? '280ms' : '360ms') : '0ms',
                    filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.24))',
                }}
            >
                <div className="absolute right-[-5px] top-[6px] h-[74px] w-[7px] rounded-r-[4px] border border-white/10 bg-[linear-gradient(180deg,rgba(245,255,251,0.4)_0%,rgba(169,222,210,0.18)_36%,rgba(14,38,38,0.58)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]" />
                <div className="absolute right-[-9px] top-[9px] h-[68px] w-[5px] rounded-r-[3px] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(11,23,28,0.4))] opacity-80" />
                <div className="absolute left-0 top-0 h-full w-[10px] rounded-l-[10px] border border-white/10 bg-[linear-gradient(180deg,rgba(232,255,247,0.38)_0%,rgba(137,204,189,0.18)_38%,rgba(15,43,47,0.6)_100%)] shadow-[inset_1px_0_0_rgba(255,255,255,0.18)]" />
                <div className="absolute left-[8px] top-0 h-full w-[56px] overflow-hidden rounded-[12px] border border-white/24 bg-[linear-gradient(165deg,rgba(255,255,255,0.44)_0%,rgba(225,255,247,0.2)_16%,rgba(101,192,171,0.18)_36%,rgba(11,33,37,0.76)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-14px_24px_rgba(3,7,18,0.3)] backdrop-blur-md">
                    <div className="absolute inset-[2px] rounded-[10px] border border-white/12" />
                    <div className="absolute left-[10px] top-[9px] h-[24px] w-[35px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.52)_0%,rgba(255,255,255,0.16)_46%,rgba(255,255,255,0)_76%)] blur-[1px]" />
                    <div
                        className="absolute inset-y-[-14px] left-[-40px] w-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.34)_46%,rgba(255,255,255,0)_100%)] opacity-70 transition-transform ease-out"
                        style={{
                            transform: reflectionTransformByPhase[phase],
                            transitionDuration: shouldAnimate ? '700ms' : '0ms',
                        }}
                    />
                    <div className="absolute inset-x-[10px] top-[16px] h-[2px] rounded-full bg-white/58" />
                    <div className="absolute inset-x-[10px] top-[28px] h-[2px] rounded-full bg-white/34" />
                    <div className="absolute inset-x-[10px] top-[40px] h-[2px] rounded-full bg-white/24" />
                    <div className="absolute inset-x-[10px] bottom-[12px] h-[16px] rounded-[8px] bg-[linear-gradient(180deg,rgba(16,185,129,0.18),rgba(5,150,105,0.04))]" />
                </div>
            </div>
        </div>
    );
};

const ProjectPublishedScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();
    const [iconPhase, setIconPhase] = useState<CelebrationPhase>('stable');
    const [showHeadline, setShowHeadline] = useState(true);
    const [showSubtitle, setShowSubtitle] = useState(true);
    const [showActions, setShowActions] = useState(true);
    const [shouldAnimateCelebration, setShouldAnimateCelebration] = useState(false);

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
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        let pendingToken = '';
        try {
            const raw = window.sessionStorage.getItem(PUBLISH_SUCCESS_CELEBRATION_STORAGE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as {
                token?: string;
                projectId?: string;
                releaseId?: string;
                publishTarget?: string;
                publicationVersion?: number;
            };
            const matchesCurrentSuccess =
                parsed.projectId === projectId &&
                parsed.releaseId === releaseId &&
                parsed.publishTarget === publishTarget &&
                parsed.publicationVersion === publicationVersion &&
                typeof parsed.token === 'string' &&
                parsed.token.trim().length > 0;

            if (!matchesCurrentSuccess) {
                return;
            }

            pendingToken = parsed.token.trim();
            const consumedKey = `${PUBLISH_SUCCESS_CELEBRATION_STORAGE_KEY}:consumed:${pendingToken}`;
            if (window.sessionStorage.getItem(consumedKey) === '1') {
                return;
            }

            window.sessionStorage.setItem(consumedKey, '1');
            window.sessionStorage.removeItem(PUBLISH_SUCCESS_CELEBRATION_STORAGE_KEY);
            setShouldAnimateCelebration(true);
            setIconPhase('hidden');
            setShowHeadline(false);
            setShowSubtitle(false);
            setShowActions(false);
        } catch {
            return;
        }
    }, [projectId, publishTarget, publicationVersion, releaseId]);

    useEffect(() => {
        if (!shouldAnimateCelebration) {
            setIconPhase('stable');
            setShowHeadline(true);
            setShowSubtitle(true);
            setShowActions(true);
            return;
        }

        const timeouts = [
            window.setTimeout(() => setIconPhase('spawn'), 120),
            window.setTimeout(() => setIconPhase('arrival'), isRepublish ? 210 : 250),
            window.setTimeout(() => setIconPhase('settle'), isRepublish ? 360 : 520),
            window.setTimeout(() => setIconPhase('stable'), isRepublish ? 520 : 650),
            window.setTimeout(() => setShowHeadline(true), 700),
            window.setTimeout(() => setShowSubtitle(true), 820),
            window.setTimeout(() => setShowActions(true), 950),
        ];

        return () => {
            timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
        };
    }, [isRepublish, shouldAnimateCelebration]);

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
                <SignaturePublishBook
                    phase={iconPhase}
                    isRepublish={isRepublish}
                    shouldAnimate={shouldAnimateCelebration}
                />

                <BilingualText
                    role="H1"
                    className={`!mb-2 !text-4xl !text-white text-center drop-shadow-lg transition-all duration-500 ${
                        showHeadline ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                    }`}
                >
                    {isRepublish
                        ? (lang === 'en' ? 'Published Updated' : 'تم تحديث النشر')
                        : (lang === 'en' ? 'Published!' : 'تم النشر!')}
                </BilingualText>

                <BilingualText
                    role="Body"
                    className={`mb-8 text-center text-white/70 transition-all duration-500 ${
                        showSubtitle ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                    }`}
                >
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

                <div
                    className={`grid w-full grid-cols-1 gap-3 transition-all duration-500 sm:grid-cols-2 ${
                        showActions ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
                    }`}
                >
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
