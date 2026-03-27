// components/content/DiscoveryEntryCard.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { cn } from '../../lib/utils.ts';

const DiscoveryEntryCard: React.FC = () => {
  const { navigate } = useNavigation();
  const { lang } = useI18n();

  const handleClick = () => {
    navigate({
      type: 'stack',
      id: 'discovery'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-6"
    >
      <button
        onClick={handleClick}
        className={cn(
          "w-full rounded-2xl border px-6 py-4 text-left transition-all",
          "bg-white/5 dark:bg-white/5",
          "border-black/5 dark:border-white/10",
          "hover:bg-white/10 dark:hover:bg-white/10",
          "active:scale-[0.98]"
        )}
      >
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-semibold">
            {lang === 'en' ? 'Explore New Directions' : 'استكشف مسارات جديدة'}
          </h3>

          <p className="text-sm text-slate-500 line-clamp-1">
            {lang === 'en'
              ? 'Discover paths beyond search.'
              : 'اكتشف مسارات تتجاوز البحث.'}
          </p>

          <span className="text-sm font-semibold text-primary pt-0.5">
            {lang === 'en' ? 'Explore →' : 'استكشف ←'}
          </span>
        </div>
      </button>
    </motion.div>
  );
};

export default DiscoveryEntryCard;
