import React from 'react';
import BilingualText from './BilingualText.tsx';
import Button from './Button.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { UndoIcon } from '../icons/UndoIcon.tsx'; 

interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    className?: string;
}

const ErrorState: React.FC<ErrorStateProps> = ({ title, message, onRetry, className }) => {
    const { lang } = useI18n();

    return (
        <div className={`flex flex-col items-center justify-center p-8 text-center bg-slate-800/50 rounded-xl border border-white/5 ${className}`}>
            <BilingualText role="H1" className="!text-lg text-slate-200 mb-2">
                {title || (lang === 'en' ? 'Unable to load content' : 'تعذر تحميل المحتوى')}
            </BilingualText>
            <BilingualText role="Body" className="text-slate-400 mb-6">
                {message || (lang === 'en' ? 'Please check your connection and try again.' : 'يرجى التحقق من اتصالك والمحاولة مرة أخرى.')}
            </BilingualText>
            {onRetry && (
                <Button onClick={onRetry} variant="ghost" className="flex items-center gap-2">
                    <UndoIcon className="w-4 h-4" />
                    {lang === 'en' ? 'Retry' : 'إعادة المحاولة'}
                </Button>
            )}
        </div>
    );
};

export default ErrorState;