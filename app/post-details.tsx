import React, { useRef } from 'react';
import { motion, useAnimation, PanInfo } from 'framer-motion';
import { useNavigation } from '../store/navigation.tsx';
import { usePostDetails } from '../lib/hooks/usePostDetails.ts';
import ThreadHeader from '../components/content/ThreadHeader.tsx';
import ThreadBody from '../components/content/ThreadBody.tsx';
import ThreadComments from '../components/content/ThreadComments.tsx';
import { useI18n } from '../store/i18n.tsx';
import Button from '../components/ui/Button.tsx';
import { XIcon } from '../components/icons';

/**
 * PostDetailsScreen
 * Implementation of POST_DISCUSSION_DATA_FLOW_V1.
 *
 * AUTHORITY: post_core: feed_prefetched_post
 * LOADING_POLICY: post_core: no_loading_state
 */
const PostDetailsScreen: React.FC = () => {
  const { lang } = useI18n();
  const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
  const composerRef = useRef<HTMLInputElement>(null);
  const controls = useAnimation();

  // DATA SOURCE: navigation payload only
  const params = currentView.type === 'immersive' ? currentView.params : {};
  const postId = params?.postId;
  const prefetchedPost = params?.prefetchedPost;

  /**
   * 🔒 UNCONDITIONAL HOOK
   * Must execute on every render to preserve hook order.
   * The hook itself is spec’d to be extraction-only (no fetch).
   */
  const { data: post, status } = usePostDetails(
    postId,
    prefetchedPost
  );

  /**
   * ERROR_POLICY: post_missing → abort surface
   * Zero-spinner mandate preserved.
   */
  if (!postId || !prefetchedPost) {
    console.warn(
      '[DATA_FLOW] Critical failure: POST_CORE missing from navigation params.'
    );
    return null;
  }

  const handleBack = () => {
    const fromView = params?.from;
    if (
      fromView &&
      fromView.type === 'tab' &&
      fromView.id === 'social' &&
      postId
    ) {
      navigateToSocialAndHighlight(postId);
    } else if (fromView) {
      navigate(fromView);
    } else {
      navigate({ type: 'tab', id: 'social' });
    }
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 150 && info.velocity.y > 500) {
      handleBack();
    } else {
      controls.start({ y: 0 });
    }
  };

  // UI_GUARD: post resolution failed
  if (status === 'error' || !post) return null;

  return (
    <div
      className="h-screen w-full flex flex-col justify-end bg-black/20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 z-0" onClick={handleBack} />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{
          type: 'spring',
          damping: 32,
          stiffness: 300,
          mass: 0.8
        }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={{ bottom: 0.8 }}
        onDragEnd={handleDragEnd}
        className="relative z-10 w-full h-[92vh] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <header className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-b border-black/5 dark:border-white/5">
          <div className="flex-grow">
            <ThreadHeader post={post} />
          </div>
          <Button
            variant="icon"
            onClick={handleBack}
            className="!bg-slate-100 dark:!bg-slate-800 !p-2 !h-10 !w-10 rounded-full"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </Button>
        </header>

        <div className="flex-grow flex flex-col overflow-hidden">
          <article className="flex-shrink-0 px-6 py-6 bg-slate-50/50 dark:bg-white/[0.02] border-b border-black/5 dark:border-white/5 overflow-hidden">
            <div className="max-h-[30vh] overflow-y-auto pr-2 scrollbar-hide">
              <ThreadBody post={post} />
            </div>
          </article>

          <section className="flex-grow overflow-y-auto scroll-smooth">
            <ThreadComments post={post} composerRef={composerRef} />
          </section>
        </div>
      </motion.div>
    </div>
  );
};

export default PostDetailsScreen;