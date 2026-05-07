import React, { useState } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { FeedbackType } from '../../types/entities.ts';
import Button from '../../components/ui/Button.tsx';
import InputField from '../../components/ui/InputField.tsx';
import { useSubmitFeedback } from '../../lib/hooks/useSubmitFeedback.ts';
import { MediaIcon } from '../../components/icons/MediaIcon.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import ContentRail from '../../components/layout/ContentRail.tsx';

const FEEDBACK_TYPES: { id: FeedbackType; en: string; ar: string }[] = [
    { id: 'action-required', en: 'Action Required', ar: 'يتطلب إجراء' },
    { id: 'praise-general', en: 'Praise/General', ar: 'ثناء/عام' },
];

const FeedbackScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate } = useNavigation();
    const { user: authUser } = useAuth();
    const { mutate: submitFeedback, isLoading: isSubmitting } = useSubmitFeedback();

    const [feedbackType, setFeedbackType] = useState<FeedbackType>('action-required');
    const [text, setText] = useState('');
    const [email, setEmail] = useState(authUser?.email || '');
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleBack = () => navigate({ type: 'tab', id: 'home' });
    
    const resetForm = () => {
        setFeedbackType('action-required');
        setText('');
        setEmail(authUser?.email || '');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;

        submitFeedback({
            type: feedbackType,
            text,
            email,
            attachments: [],
        }, {
            onSuccess: () => {
                setIsSubmitted(true);
                resetForm();
            }
        });
    };
    
    if (isSubmitted) {
        return (
            <div className="h-screen flex flex-col">
                <ScreenHeader titleEn="Feedback" titleAr="ملاحظات" onBack={handleBack} />
                <main className="flex-grow overflow-y-auto pt-24 pb-8 flex items-center justify-center">
                    <ContentRail variant="narrow" className="text-center">
                        <CheckCircleIcon className="h-16 w-16 text-accent mx-auto mb-4" />
                        <BilingualText role="H1" className="!text-2xl">
                            {lang === 'en' ? 'Thank You!' : 'شكراً لك!'}
                        </BilingualText>
                        <BilingualText role="Body" className="mt-2 text-white/70">
                            {lang === 'en' ? 'We\'ve received your feedback.' : 'لقد تلقينا ملاحظاتك.'}
                        </BilingualText>
                        <Button variant="ghost" onClick={() => setIsSubmitted(false)} className="mt-8">
                             {lang === 'en' ? 'Submit another response' : 'إرسال رد آخر'}
                        </Button>
                    </ContentRail>
                </main>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col">
            <ScreenHeader titleEn="Feedback" titleAr="ملاحظات" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-24 pb-8">
                <ContentRail variant="narrow">
                    <form onSubmit={handleSubmit} className="space-y-6">
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
                            <Button type="button" variant="ghost" disabled>
                                <MediaIcon className="h-5 w-5 mr-2" />
                                {lang === 'en' ? 'Image attachments unavailable' : 'مرفقات الصور غير متاحة'}
                            </Button>
                            <BilingualText role="Caption" className="mt-2 block text-slate-500 dark:text-white/45">
                                {lang === 'en'
                                    ? 'Feedback can be submitted as text until the upload pipeline is connected.'
                                    : 'يمكن إرسال الملاحظات كنص إلى أن يتم توصيل مسار الرفع.'}
                            </BilingualText>
                        </div>

                        <InputField
                            id="email"
                            label={lang === 'en' ? 'Email (Optional)' : 'البريد الإلكتروني (اختياري)'}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        
                        <Button type="submit" className="w-full" disabled={isSubmitting || !text.trim()}>
                            {isSubmitting ? <LoadingSpinner /> : (lang === 'en' ? 'Submit Feedback' : 'إرسال الملاحظات')}
                        </Button>
                    </form>
                </ContentRail>
            </main>
        </div>
    );
};
export default FeedbackScreen;
