import React, { useRef, useMemo } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { XIcon } from '../../components/icons/XIcon.tsx';
import Button from '../../components/ui/Button.tsx';
import ThreadComments from '../../components/content/ThreadComments.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { cn } from '../../lib/utils.ts';
import { Post, ThreadPost } from '../../types/entities.ts';

/**
 * PostDiscussionScreen
 * Authoritative implementation of POST_DISCUSSION_SURFACE_IMPLEMENTATION_V1 (LOCKED).
 */
const PostDiscussionScreen: React.FC = () => {
  const { lang, isRTL } = useI18n();
  const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
  const composerRef = useRef<HTMLInputElement>(null);

  // DATA_CONTRACT: Only use prefetchedPost from navigation params. No fetching allowed.
  const params = currentView.type === 'immersive' ? currentView.params : {};
  const postId = params?.postId;
  const prefetchedPost = params?.prefetchedPost as Post | undefined;

  const handleBack = React.useCallback(() => {
    const fromView = params?.from;
    if (fromView && fromView.type === 'tab' && fromView.id === 'social' && postId) {
      navigateToSocialAndHighlight(postId);
    } else if (fromView) {
      navigate(fromView);
    } else {
      navigate({ type: 'tab', id: 'social' });
    }
  }, [params?.from, navigate, navigateToSocialAndHighlight, postId]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 100 && info.velocity.y > 300) {
      handleBack();
    }
  };

  // -----------------------------
  // 🔒 HOOKS MUST BE UNCONDITIONAL
  // -----------------------------

  const threadPost: ThreadPost | null = useMemo(() => {
    if (!prefetchedPost) return null;

    return {
      id: prefetchedPost.id,
      authorId: prefetchedPost.authorId,
      authorName: prefetchedPost.authorName,
      authorHandle: prefetchedPost.authorHandle,
      authorAvatar: prefetchedPost.authorAvatar,
      createdAt: prefetchedPost.timestamps.createdAt,
      visibility: prefetchedPost.visibility,
      status: prefetchedPost.status,
      content: {
        text: prefetchedPost.content.text,
        attachments: prefetchedPost.content.attachments
      }
    };
  }, [prefetchedPost]);

  const timeLabel = useMemo(() => {
    if (!threadPost) return '';
    return new Date(threadPost.createdAt).toLocaleDateString(
      lang === 'ar' ? 'ar-EG' : 'en-US',
      { month: 'short', day: 'numeric' }
    );
  }, [threadPost, lang]);

  // -----------------------------
  // UI_GUARD (NOW SAFE)
  // -----------------------------

  if (!postId || !prefetchedPost || !threadPost) return null;

  return (
    <div
      className="h-screen w-full flex flex-col justify-end bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      {/* DISMISS_BEHAVIOR: click_backdrop */}
      <div className="absolute inset-0 z-0" onClick={handleBack} />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 250 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={{ bottom: 0.5 }}
        onDragEnd={handleDragEnd}
        className="relative z-10 w-full h-[90vh] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <header className="flex-shrink-0 px-6 py-4 border-b border-black/5 dark:border-white/5 bg-white dark:bg-slate-900">
          <div className={cn(
            'flex items-start justify-between gap-4',
            isRTL ? 'flex-row-reverse' : 'flex-row'
          )}>
            <div className={cn(
              'flex items-center gap-3 min-w-0',
              isRTL && 'flex-row-reverse'
            )}>
              <img
                src={threadPost.authorAvatar}
                alt={threadPost.authorName}
                className="h-9 w-9 rounded-full object-cover border border-black/5 dark:border-white/10"
              />
              <div className="min-w-0">
                <BilingualText className="font-bold text-sm truncate">
                  {threadPost.authorName}
                </BilingualText>
                <BilingualText role="Caption" className="!text-[10px] opacity-60">
                  {threadPost.authorHandle} • {timeLabel}
                </BilingualText>
              </div>
            </div>

            <Button
              variant="icon"
              onClick={handleBack}
              className="!bg-slate-100 dark:!bg-slate-800 !p-1.5 !h-8 !w-8 rounded-full"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 px-1">
            <BilingualText
              role="Body"
              className="text-sm line-clamp-2 italic opacity-70"
            >
              {threadPost.content.text}
            </BilingualText>
          </div>
        </header>

        {/* Body */}
        <div className="flex-grow overflow-y-auto">
          <div className="container mx-auto max-w-2xl min-h-full">
            <ThreadComments post={threadPost} composerRef={composerRef} />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PostDiscussionScreen;