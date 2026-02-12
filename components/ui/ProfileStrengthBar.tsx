
// components/ui/ProfileStrengthBar.tsx
import React from 'react';
import BilingualText from './BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';

export default function ProfileStrengthBar({ score }: { score: number }) {
  const { lang } = useI18n();
  const clamped = Math.max(0, Math.min(score, 100));

  return (
    <div className="mt-4 mb-6">
      <BilingualText role="Caption" className="mb-1.5 text-slate-500 dark:text-white/60 font-bold uppercase tracking-wider !text-[10px]">
        {lang === 'en' ? 'Profile strength' : 'قوة الملف الشخصي'}
      </BilingualText>

      <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700/50 overflow-hidden border border-black/5 dark:border-white/5">
        <div
          className="h-full bg-accent transition-all duration-700 ease-out shadow-[0_0_8px_rgba(56,189,248,0.3)]"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 px-0.5">
        <span className="text-[10px] font-bold text-slate-400">{clamped}%</span>
        {clamped < 100 && (
           <span className="text-[9px] text-slate-400 italic">
              {lang === 'en' ? 'Complete your profile to build authority' : 'أكمل ملفك الشخصي لبناء المصداقية'}
           </span>
        )}
      </div>
    </div>
  );
}
