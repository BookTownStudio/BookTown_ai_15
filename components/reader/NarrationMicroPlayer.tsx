import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '../../store/i18n.tsx';
import { PauseIcon } from '../icons/PauseIcon.tsx';
import { PlayIcon } from '../icons/PlayIcon.tsx';
import { SkipBackIcon } from '../icons/SkipBackIcon.tsx';
import { SkipForwardIcon } from '../icons/SkipForwardIcon.tsx';
import { XIcon } from '../icons/XIcon.tsx';

interface NarrationMicroPlayerProps {
  isVisible: boolean;
  title: string;
  status: 'idle' | 'playing' | 'paused';
  playbackRate: number;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onSpeedChange: () => void;
  onClose: () => void;
}

function formatPlaybackRate(value: number): string {
  return `${value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}x`;
}

const motionTransition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1] as const,
};

const NarrationMicroPlayer: React.FC<NarrationMicroPlayerProps> = ({
  isVisible,
  title,
  status,
  playbackRate,
  onPrevious,
  onPlayPause,
  onNext,
  onSpeedChange,
  onClose,
}) => {
  const { lang } = useI18n();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 18 }}
          transition={motionTransition}
          className="fixed left-1/2 z-[15] h-[72px] w-[78%] max-w-[440px] -translate-x-1/2 rounded-[20px] border border-white/14 bg-[linear-gradient(180deg,rgba(27,38,63,0.82),rgba(17,25,44,0.88))] shadow-[0_14px_34px_rgba(8,12,20,0.18)] backdrop-blur-2xl sm:h-20"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid h-full grid-rows-[18px_1fr] px-3 pb-2 pt-2 sm:px-4">
            <p
              className="mx-auto max-w-[88%] truncate text-center text-[12px] font-medium tracking-[0.01em] text-white/68"
              title={title}
            >
              {title}
            </p>

            <div className="flex items-center justify-center gap-2.5 sm:gap-3.5">
              <button
                type="button"
                onClick={onPrevious}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/84 transition hover:bg-white/10"
                aria-label={lang === 'en' ? 'Previous paragraph' : 'الفقرة السابقة'}
              >
                <SkipBackIcon className="h-4.5 w-4.5" />
              </button>

              <button
                type="button"
                onClick={onPlayPause}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#0f1830] shadow-[0_8px_18px_rgba(255,255,255,0.16)] transition hover:scale-[1.02]"
                aria-label={
                  status === 'playing'
                    ? (lang === 'en' ? 'Pause narration' : 'إيقاف السرد مؤقتاً')
                    : (lang === 'en' ? 'Play narration' : 'تشغيل السرد')
                }
              >
                {status === 'playing' ? (
                  <PauseIcon className="h-5 w-5" />
                ) : (
                  <PlayIcon className="h-5 w-5" />
                )}
              </button>

              <button
                type="button"
                onClick={onNext}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/84 transition hover:bg-white/10"
                aria-label={lang === 'en' ? 'Next paragraph' : 'الفقرة التالية'}
              >
                <SkipForwardIcon className="h-4.5 w-4.5" />
              </button>

              <button
                type="button"
                onClick={onSpeedChange}
                className="flex h-9 min-w-[60px] items-center justify-center rounded-full border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white/90 transition hover:bg-white/14"
                aria-label={lang === 'en' ? 'Change speed' : 'تغيير السرعة'}
              >
                {formatPlaybackRate(playbackRate)}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/72 transition hover:bg-white/10 hover:text-white"
                aria-label={lang === 'en' ? 'Close narration controls' : 'إغلاق عناصر تحكم السرد'}
              >
                <XIcon className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NarrationMicroPlayer;
