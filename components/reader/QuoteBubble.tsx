
import React from 'react';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { QuoteIcon } from '../icons/QuoteIcon.tsx';
import { motion } from 'framer-motion';

interface QuoteBubbleProps {
    rect: DOMRect;
    onSave: () => void;
    onDismiss: () => void;
    saveLabel?: string;
    dismissLabel?: string;
    icon?: React.ReactNode;
}

const QuoteBubble: React.FC<QuoteBubbleProps> = ({
    rect,
    onSave,
    onDismiss,
    saveLabel,
    dismissLabel,
    icon,
}) => {
    const { lang } = useI18n();

    // Position securely above the selection, clamping to window edges if needed
    const top = window.scrollY + rect.top - 60;
    const left = window.scrollX + rect.left + (rect.width / 2);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed z-50 pointer-events-auto"
            style={{ 
                top: top, 
                left: left,
                transform: 'translateX(-50%)'
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
        >
            <div className="flex items-center p-1.5 rounded-full bg-slate-900 shadow-xl border border-white/20 ring-1 ring-black/50">
                <Button
                    variant="ghost"
                    className="!py-1.5 !px-4 !text-sm !text-white hover:!bg-white/10 !rounded-full flex items-center gap-2"
                    onClick={onSave}
                >
                    {icon ?? <QuoteIcon className="h-4 w-4 text-accent" />}
                    <span className="font-semibold">{saveLabel ?? (lang === 'en' ? 'Save Quote' : 'حفظ الاقتباس')}</span>
                </Button>
                <div className="w-px h-4 bg-white/20 mx-1" />
                 <Button
                    variant="ghost"
                    className="!py-1.5 !px-3 !text-xs !text-white/60 hover:!text-white hover:!bg-white/10 !rounded-full"
                    onClick={onDismiss}
                >
                    {dismissLabel ?? (lang === 'en' ? 'Cancel' : 'إلغاء')}
                </Button>
            </div>
            {/* Arrow pointer */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-white/20 transform rotate-45 -mt-1.5 shadow-lg" />
        </motion.div>
    );
};

export default QuoteBubble;
