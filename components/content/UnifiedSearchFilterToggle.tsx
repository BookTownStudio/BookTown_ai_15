import React from 'react';
import { cn } from '../../lib/utils.ts';
import { useI18n } from '../../store/i18n.tsx';

interface UnifiedSearchFilterToggleProps {
  ebookOnly: boolean;
  onToggle: () => void;
  className?: string;
}

const UnifiedSearchFilterToggle: React.FC<UnifiedSearchFilterToggleProps> = ({
  ebookOnly,
  onToggle,
  className = '',
}) => {
  const { lang } = useI18n();

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'px-4 py-2 rounded-full border text-sm font-semibold transition-all active:scale-95 shadow-sm',
        ebookOnly
          ? 'bg-primary text-white border-primary'
          : 'bg-white/5 text-slate-500 border-black/10 dark:border-white/10',
        className
      )}
    >
      {lang === 'en' ? 'In-App Ebooks' : 'كتب داخل التطبيق'}
    </button>
  );
};

export default UnifiedSearchFilterToggle;
