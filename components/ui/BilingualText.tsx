import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { cn } from '../../lib/utils.ts';

type TextRole = 'H1' | 'H2' | 'H3' | 'Body' | 'Caption' | 'Quote' | 'Label';

interface BilingualTextProps extends React.HTMLAttributes<HTMLElement> {
  role?: TextRole;
  children: React.ReactNode;
  className?: string;
}

const BilingualText: React.FC<BilingualTextProps> = ({ 
  role = 'Body', 
  children, 
  className = '',
  ...props 
}) => {
  const { isRTL, lang } = useI18n();

  const roleStyles: Record<TextRole, string> = {
    H1: 'text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white',
    H2: 'text-xl md:text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100',
    H3: 'text-lg md:text-xl font-semibold text-slate-800 dark:text-slate-200',
    Body: 'text-base font-normal leading-relaxed text-slate-600 dark:text-slate-300',
    Caption: 'text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400',
    Label: 'text-sm font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400',
    Quote: 'text-lg md:text-xl italic leading-relaxed text-slate-700 dark:text-slate-200 pl-4 border-l-4 border-accent',
  };

  const fontStyles = lang === 'ar' ? 'font-cairo font-sans' : 'font-inter font-sans';
  const alignmentStyles = isRTL ? 'text-right' : 'text-left';
  
  let roleClass = roleStyles[role];
  if (role === 'Quote' && isRTL) {
      roleClass = roleClass.replace('pl-4', 'pr-4').replace('border-l-4', 'border-r-4');
  }

  const Tag = role === 'H1' ? 'h1' : role === 'H2' ? 'h2' : role === 'H3' ? 'h3' : 'p';

  return (
    <Tag 
        className={cn(roleClass, fontStyles, alignmentStyles, className)}
        {...props}
    >
      {children}
    </Tag>
  );
};

export default BilingualText;
