import React, { useMemo } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { XIcon } from '../../components/icons/XIcon.tsx';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { cn } from '../../lib/utils.ts';

/**
 * PostTextOverlayScreen
 * Implementation of POST_TEXT_OVERLAY_GUARD_V1 (LOCKED).
 */
const PostTextOverlayScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang, isRTL } = useI18n();

  // GUARD SOURCE: navigation payload only (no fetch)
  const params = currentView.type === 'immersive' ? currentView.params : null;
  const post = params?.post;

  const handleBack = React.useCallback(() => {
    navigate(params?.from || { type: 'tab', id: 'social' });
  }, [params?.from, navigate]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 100 && info.velocity.y > 300) {
      handleBack();
    }
  };

  // -----------------------------
  // 🔒 UNCONDITIONAL HOOKS
  // -----------------------------

  const timeLabel = useMemo(() => {
    if (!post?.timestamps?.createdAt) return '';

    try {
      return new Date(post.timestamps.createdAt).toLocaleDateString(
        lang === 'ar' ? 'ar-EG' : 'en-US',
        {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }
      );
    } catch {
      return '';
    }
  }, [post?.timestamps?.createdAt, lang]);

  // -----------------------------
  // UI GUARD (SAFE)
  // -----------------------------

  if (!post || !post.content?.text) return null;

  return (
    <div
      className="h-screen w-full bg-black/60 backdrop-blur-md flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      {/* Clickable backdrop */}
      <div className="absolute inset-0 z-0" onClick={handleBack} />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={{ bottom: 0.5 }}
        onDragEnd={handleDragEnd}
        className="relative z-10 w-full h-[95vh] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <header className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-b border-black/5 dark:border-white/5">
          <div className={cn(
            'flex items-center gap-3 min-w-0',
            isRTL ? 'flex-row-reverse' : 'flex-row'
          )}>
            <img
              src={post.authorAvatar}
              alt={post.authorName}
              className="h-8 w-8 rounded-full object-cover border border-black/5 dark:border-white/10 bg-slate-100 dark:bg-slate-800"
            />
            <div className="min-w-0">
              <BilingualText className="font-bold text-sm truncate">
                {post.authorName}
              </BilingualText>
              <BilingualText role="Caption" className="!text-[10px] opacity-60">
                {post.authorHandle} • {timeLabel}
              </BilingualText>
            </div>
          </div>

          <Button
            variant="icon"
            onClick={handleBack}
            className="!bg-slate-100 dark:!bg-slate-800 !p-1.5 !h-8 !w-8 rounded-full"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </header>

        {/* Content */}
        <main className="flex-grow overflow-y-auto px-6 py-8 scroll-smooth">
          <article className="container mx-auto max-w-2xl">
            <BilingualText
              role="Body"
              className="text-xl md:text-2xl leading-relaxed font-serif whitespace-pre-wrap"
            >
              {post.content.text}
            </BilingualText>

            {/* Interaction guard */}
            <div className="h-24" />
          </article>
        </main>
      </motion.div>
    </div>
  );
};

export default PostTextOverlayScreen;