import React, { useCallback, useEffect, useState } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAuth } from '../../lib/auth.tsx';
import Button from '../../components/ui/Button.tsx';
import InputField from '../../components/ui/InputField.tsx';
import { useSubmitFeedback } from '../../lib/hooks/useSubmitFeedback.ts';
import { useFeedbackAttachmentUpload, validateFeedbackAttachmentFile } from '../../lib/hooks/useFeedbackAttachmentUpload.ts';
import { MediaIcon } from '../../components/icons/MediaIcon.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import { XIcon } from '../../components/icons/XIcon.tsx';
import ContentRail from '../../components/layout/ContentRail.tsx';
import { cn } from '../../lib/utils.ts';
import type { FeedbackIntentType } from '../../contracts/apiContracts.ts';
import {
    FEEDBACK_SOFT_COOLDOWN_MS,
    getFeedbackCooldownMessage,
    getFeedbackCooldownRemainingMs,
    isFeedbackCooldownActive,
    isFeedbackCooldownError,
    markFeedbackSubmitted,
} from '../../lib/feedback/feedbackCooldown.ts';
import { FeedbackContextService } from '../../lib/feedback/FeedbackContextService.ts';
import type { FeedbackRuntimeContext } from '../../lib/feedback/FeedbackContextService.ts';
import type { FeedbackSource } from '../../contracts/apiContracts.ts';

const FEEDBACK_TYPES: { id: FeedbackIntentType; en: string; ar: string }[] = [
    { id: 'bug', en: 'Action Required', ar: 'يتطلب إجراء' },
    { id: 'praise', en: 'Praise/General', ar: 'ثناء/عام' },
];

function isFeedbackRuntimeContext(value: unknown): value is FeedbackRuntimeContext {
    return Boolean(value) && typeof value === 'object';
}

function resolveFeedbackSource(value: unknown): FeedbackSource {
    return value === 'appnav_beta' ? 'appnav_beta' : 'drawer';
}

const FeedbackScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { user: authUser } = useAuth();
    const { mutate: submitFeedback, isPending: isSubmitting } = useSubmitFeedback();
    const { uploadAttachments, isUploading } = useFeedbackAttachmentUpload();

    const [feedbackType, setFeedbackType] = useState<FeedbackIntentType>('bug');
    const [text, setText] = useState('');
    const [email, setEmail] = useState(authUser?.email || '');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [receiptId, setReceiptId] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [cooldownRemainingMs, setCooldownRemainingMs] = useState(() => getFeedbackCooldownRemainingMs());

    useEffect(() => {
        const syncCooldown = () => setCooldownRemainingMs(getFeedbackCooldownRemainingMs());
        syncCooldown();
        const timer = window.setInterval(syncCooldown, 1000);
        return () => window.clearInterval(timer);
    }, []);

    const returnView = currentView.type === 'immersive' && currentView.id === 'feedback'
        ? currentView.params?.from
        : undefined;
    const isContextualLaunch = Boolean(returnView);
    const feedbackSource = currentView.type === 'immersive' && currentView.id === 'feedback'
        ? resolveFeedbackSource(currentView.params?.feedbackSource)
        : 'drawer';
    const launchContext = currentView.type === 'immersive' && currentView.id === 'feedback' && isFeedbackRuntimeContext(currentView.params?.feedbackContext)
        ? currentView.params.feedbackContext
        : null;

    const returnToPreviousSurface = () => navigate(returnView || { type: 'tab', id: 'home' });
    const handleBack = () => returnToPreviousSurface();
    const hasUnsavedDraft = text.trim().length > 0 || attachments.length > 0;
    const requestContextualDismiss = useCallback(() => {
        if (!isContextualLaunch) {
            navigate(returnView || { type: 'tab', id: 'home' });
            return;
        }
        if (!hasUnsavedDraft || window.confirm(lang === 'en' ? 'Discard this feedback draft?' : 'هل تريد تجاهل مسودة الملاحظات؟')) {
            navigate(returnView || { type: 'tab', id: 'home' });
        }
    }, [hasUnsavedDraft, isContextualLaunch, lang, navigate, returnView]);

    useEffect(() => {
        if (!isContextualLaunch) return undefined;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                requestContextualDismiss();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isContextualLaunch, requestContextualDismiss]);
    
    const resetForm = () => {
        setFeedbackType('bug');
        setText('');
        setEmail(authUser?.email || '');
        setSubmitError(null);
        setAttachments([]);
        setUploadProgress(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;
        if (isFeedbackCooldownActive()) {
            setSubmitError(getFeedbackCooldownMessage(lang));
            setCooldownRemainingMs(getFeedbackCooldownRemainingMs());
            return;
        }

        submitFeedback({
            source: feedbackSource,
            intentType: feedbackType,
            text,
            contactEmail: email.trim() || null,
            clientContext: launchContext ?? FeedbackContextService.capture({ currentView, locale: lang }),
        }, {
            onSuccess: async (receipt) => {
                try {
                    markFeedbackSubmitted();
                    setCooldownRemainingMs(FEEDBACK_SOFT_COOLDOWN_MS);
                    if (attachments.length > 0) {
                        await uploadAttachments(receipt.feedbackId, attachments, (fileName, progress) => {
                            setUploadProgress(`${fileName}: ${progress}%`);
                        });
                    }
                    setReceiptId(receipt.feedbackId);
                    if (isContextualLaunch) {
                        resetForm();
                        returnToPreviousSurface();
                        return;
                    }
                    setIsSubmitted(true);
                    resetForm();
                } catch (error) {
                    setSubmitError(error instanceof Error ? error.message : 'Screenshot upload failed.');
                }
            },
            onError: (error) => {
                setSubmitError(isFeedbackCooldownError(error)
                    ? getFeedbackCooldownMessage(lang)
                    : error instanceof Error ? error.message : 'Feedback submission failed.');
                setCooldownRemainingMs(getFeedbackCooldownRemainingMs());
            }
        });
    };

    const isCooldownActive = cooldownRemainingMs > 0;
    
    const renderSuccess = () => (
        <>
                {!isContextualLaunch && <ScreenHeader titleEn="Feedback" titleAr="ملاحظات" onBack={handleBack} />}
                <main className={cn(
                    "flex-grow overflow-y-auto pb-8 flex items-center justify-center",
                    isContextualLaunch ? "pt-4" : "pt-24"
                )}>
                    <ContentRail variant="narrow" className="text-center">
                        <CheckCircleIcon className="h-16 w-16 text-accent mx-auto mb-4" />
                        <BilingualText role="H1" className="!text-2xl">
                            {lang === 'en' ? 'Thank You!' : 'شكراً لك!'}
                        </BilingualText>
                        <BilingualText role="Body" className="mt-2 text-white/70">
                            {lang === 'en' ? 'Feedback received! Thanks for helping us build.' : 'تم استلام ملاحظاتك! شكراً لمساعدتنا في البناء.'}
                        </BilingualText>
                        {receiptId && (
                            <BilingualText role="Caption" className="mt-3 block text-white/50">
                                {lang === 'en' ? `Receipt: ${receiptId}` : `رقم الإيصال: ${receiptId}`}
                            </BilingualText>
                        )}
                        {isCooldownActive && (
                            <BilingualText role="Caption" className="mt-4 block text-white/55">
                                {getFeedbackCooldownMessage(lang)}
                            </BilingualText>
                        )}
                        <Button variant="ghost" onClick={() => setIsSubmitted(false)} className="mt-8" disabled={isCooldownActive}>
                             {lang === 'en'
                                ? (isCooldownActive ? `Submit another response in ${Math.ceil(cooldownRemainingMs / 1000)}s` : 'Submit another response')
                                : (isCooldownActive ? `إرسال رد آخر خلال ${Math.ceil(cooldownRemainingMs / 1000)}ث` : 'إرسال رد آخر')}
                        </Button>
                    </ContentRail>
                </main>
        </>
    );

    const renderForm = () => (
        <>
            {!isContextualLaunch && <ScreenHeader titleEn="Feedback" titleAr="ملاحظات" onBack={handleBack} />}
            <main className={cn(
                "flex-grow overflow-y-auto pb-8",
                isContextualLaunch ? "pt-4" : "pt-24"
            )}>
                <ContentRail variant="narrow">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {isContextualLaunch && (
                            <div className="flex items-start justify-between gap-4 pb-1">
                                <div>
                                    <BilingualText role="H1" className="!text-xl">
                                        {lang === 'en' ? 'Feedback' : 'ملاحظات'}
                                    </BilingualText>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestContextualDismiss}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                                    aria-label={lang === 'en' ? 'Close feedback' : 'إغلاق الملاحظات'}
                                >
                                    <XIcon className="h-5 w-5" />
                                </button>
                            </div>
                        )}
                        <div>
                            <BilingualText role="Caption" className="!text-slate-700 dark:!text-white/80 mb-2 block">
                                {lang === 'en' ? 'Type of Feedback' : 'نوع الملاحظات'}
                            </BilingualText>
                            <div className="grid grid-cols-2 gap-2">
                                {FEEDBACK_TYPES.map(type => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        onClick={() => setFeedbackType(type.id)}
                                        className={`px-3 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${
                                            feedbackType === type.id
                                                ? 'bg-accent/20 border-accent text-accent'
                                                : 'bg-black/5 dark:bg-black/20 border-transparent text-slate-600 dark:text-white/70 hover:bg-black/10 dark:hover:bg-black/30'
                                        }`}
                                    >
                                        {lang === 'en' ? type.en : type.ar}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                             <BilingualText role="Caption" className="!text-slate-700 dark:!text-white/80 mb-1 block">
                                {lang === 'en' ? 'Details' : 'التفاصيل'}
                            </BilingualText>
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                required
                                rows={6}
                                placeholder={lang === 'en' ? 'Please provide as much detail as possible...' : 'يرجى تقديم أكبر قدر ممكن من التفاصيل...'}
                                className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-200 resize-y"
                            />
                        </div>
                        
                        <div>
                            <label className="inline-flex cursor-pointer items-center rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/10">
                                <MediaIcon className="h-5 w-5 mr-2" />
                                {lang === 'en' ? 'Attach screenshot' : 'إرفاق لقطة شاشة'}
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    multiple
                                    className="sr-only"
                                    onChange={(event) => {
                                        const selected = Array.from(event.target.files ?? []).slice(0, 3);
                                        try {
                                            selected.forEach(validateFeedbackAttachmentFile);
                                            setAttachments(selected);
                                            setSubmitError(null);
                                        } catch (error) {
                                            setSubmitError(error instanceof Error ? error.message : 'Invalid screenshot.');
                                        }
                                    }}
                                />
                            </label>
                            {attachments.length > 0 && (
                                <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-white/55">
                                    {attachments.map((file) => (
                                        <div key={`${file.name}:${file.size}`} className="flex items-center justify-between gap-3">
                                            <span className="truncate">{file.name}</span>
                                            <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item !== file))}>
                                                {lang === 'en' ? 'Remove' : 'إزالة'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {uploadProgress && <BilingualText role="Caption" className="mt-2 block text-slate-500 dark:text-white/45">{uploadProgress}</BilingualText>}
                        </div>

                        <InputField
                            id="email"
                            label={lang === 'en' ? 'Email (Optional)' : 'البريد الإلكتروني (اختياري)'}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        {submitError && (
                            <BilingualText role="Caption" className="block text-red-500 dark:text-red-300">
                                {submitError}
                            </BilingualText>
                        )}
                        
                        <Button type="submit" className="w-full" disabled={isSubmitting || isUploading || !text.trim()}>
                            {isSubmitting || isUploading ? (lang === 'en' ? 'Sending...' : 'جارٍ الإرسال...') : (lang === 'en' ? 'Submit Feedback' : 'إرسال الملاحظات')}
                        </Button>
                    </form>
                </ContentRail>
            </main>
        </>
    );

    const content = isSubmitted ? renderSuccess() : renderForm();

    if (isContextualLaunch) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={lang === 'en' ? 'Feedback' : 'ملاحظات'}>
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={requestContextualDismiss}
                    data-testid="feedback-overlay-backdrop"
                    aria-hidden="true"
                />
                <section className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-[min(var(--app-rail-narrow,760px),calc(100vw-2rem))] flex-col overflow-y-auto overscroll-y-contain rounded-card border border-black/5 bg-gray-100/95 p-6 shadow-2xl shadow-black/50 dark:border-white/10 dark:bg-slate-800/95">
                    {content}
                </section>
            </div>
        );
    }

    if (isSubmitted) {
        return (
            <div className="h-screen flex flex-col">
                {content}
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col">
            {content}
        </div>
    );
};
export default FeedbackScreen;
