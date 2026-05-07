import React, { useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useReportPost } from '../../lib/hooks/useReportPost.ts';
import { useToast } from '../../store/toast.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { FlagIcon } from '../icons/FlagIcon.tsx';

interface ReportPostModalProps {
    postId: string;
    isOpen: boolean;
    onClose: () => void;
}

const ReportPostModal: React.FC<ReportPostModalProps> = ({ postId, isOpen, onClose }) => {
    const { lang } = useI18n();
    const { showToast } = useToast();
    const [reason, setReason] = useState<string | null>(null);
    const [details, setDetails] = useState('');
    const { mutate: reportPost, isPending: isLoading } = useReportPost();

    // POST_REPORTING_POLICY_V1: Standardized Canonical Report Reasons
    const reasons = [
        { id: 'spam', en: 'Spam', ar: 'محتوى غير مرغوب فيه' },
        { id: 'harassment', en: 'Harassment', ar: 'تحرش' },
        { id: 'hate_speech', en: 'Hate Speech', ar: 'خطاب كراهية' },
        { id: 'copyright', en: 'Copyright Violation', ar: 'انتهاك حقوق الطبع' },
        { id: 'misinformation', en: 'Misinformation', ar: 'معلومات مضللة' },
        { id: 'other', en: 'Other', ar: 'أسباب أخرى' }
    ];

    const handleReport = () => {
        if (!reason) return;

        reportPost({ postId, reason, details: details.trim() }, {
            onSuccess: (data) => {
                if (data.alreadyReported) {
                    showToast(lang === 'en' ? 'You have already reported this post.' : 'لقد أبلغت عن هذا المنشور بالفعل.');
                } else {
                    showToast(lang === 'en' ? 'Report submitted successfully' : 'تم إرسال البلاغ بنجاح');
                }
                onClose();
            },
            onError: (err: any) => {
                showToast(err.message || (lang === 'en' ? 'Could not submit report' : 'تعذر إرسال البلاغ'));
            }
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="p-3 bg-red-500/10 rounded-full mb-3">
                        <FlagIcon className="h-8 w-8 text-red-500" />
                    </div>
                    <BilingualText role="H1" className="!text-xl">
                        {lang === 'en' ? 'Report Post' : 'إبلاغ عن منشور'}
                    </BilingualText>
                    <BilingualText role="Body" className="mt-2 text-slate-500 dark:text-slate-400">
                        {lang === 'en' ? 'Select a reason to help us understand what\'s wrong.' : 'اختر سبباً لمساعدتنا في فهم الخطأ.'}
                    </BilingualText>
                </div>

                <div className="flex-grow overflow-y-auto pr-1 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {reasons.map(r => (
                            <button
                                key={r.id}
                                onClick={() => setReason(r.id)}
                                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                                    reason === r.id 
                                        ? 'bg-accent/10 border-accent text-accent' 
                                        : 'bg-black/5 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-300 hover:bg-black/10'
                                }`}
                                disabled={isLoading}
                            >
                                <span className="font-semibold text-sm">{lang === 'en' ? r.en : r.ar}</span>
                            </button>
                        ))}
                    </div>

                    <div>
                         <label htmlFor="report-details" className="block mb-2">
                            <BilingualText role="Caption" className="uppercase tracking-widest font-bold !text-slate-400 !text-[10px]">
                                {lang === 'en' ? 'Additional Notes' : 'ملاحظات إضافية'}
                            </BilingualText>
                        </label>
                        <textarea
                            id="report-details"
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            placeholder={lang === 'en' ? 'What happened? (Optional)' : 'ماذا حدث؟ (اختياري)'}
                            className="w-full h-24 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 text-slate-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent transition-all"
                            maxLength={500}
                            disabled={isLoading}
                        />
                    </div>
                </div>

                <div className="mt-8 flex flex-col gap-3">
                    <Button 
                        variant="primary" 
                        onClick={handleReport} 
                        disabled={isLoading || !reason}
                        className="w-full !h-12 !bg-red-600 hover:!bg-red-700 border-none"
                    >
                        {isLoading ? <LoadingSpinner className="!h-5 !w-5" /> : (lang === 'en' ? 'Report' : 'إبلاغ')}
                    </Button>
                    <Button variant="ghost" onClick={onClose} disabled={isLoading} className="w-full">
                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ReportPostModal;
