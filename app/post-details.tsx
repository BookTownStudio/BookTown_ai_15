import React, { useRef } from 'react';
import { motion, useAnimation, PanInfo } from 'framer-motion';
import { useNavigation } from '../store/navigation.tsx';
import { usePostDetails } from '../lib/hooks/usePostDetails.ts';
import ThreadHeader from '../components/content/ThreadHeader.tsx';
import ThreadBody from '../components/content/ThreadBody.tsx';
import ThreadComments from '../components/content/ThreadComments.tsx';
import { useI18n } from '../store/i18n.tsx';
import Button from '../components/ui/Button.tsx';
import { ChevronLeftIcon } from '../components/icons';

const POST_DISCUSSION_RAIL_CLASS = 'mx-auto w-full max-w-[1040px] px-4 md:px-0';

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
      className="flex h-screen w-full flex-col justify-end bg-black/20 backdrop-blur-sm md:justify-start md:bg-gray-50 md:backdrop-blur-none dark:md:bg-slate-900"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 z-0 md:hidden" onClick={handleBack} />

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
        className="relative z-10 flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl dark:bg-slate-900 md:h-screen md:rounded-none md:bg-gray-50 md:shadow-none dark:md:bg-slate-900"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <header className="flex-shrink-0 border-b border-black/5 px-4 py-4 dark:border-white/5 md:px-0">
          <div className={`${POST_DISCUSSION_RAIL_CLASS} flex items-start gap-4`}>
            <Button
              variant="ghost"
              onClick={handleBack}
              className="!mt-0.5 !h-10 !w-10 !shrink-0 !rounded-full !p-0 text-slate-700 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/5"
              aria-label={lang === 'en' ? 'Back' : 'رجوع'}
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </Button>
            <div className="min-w-0 flex-grow">
              <ThreadHeader post={post} />
            </div>
          </div>
        </header>

        <div className="flex-grow flex flex-col overflow-hidden">
          <article className="flex-shrink-0 border-b border-black/5 bg-slate-50/50 px-4 py-6 dark:border-white/5 dark:bg-white/[0.02] md:px-0">
            <div className={POST_DISCUSSION_RAIL_CLASS}>
              <div className="max-h-[30vh] overflow-y-auto scrollbar-hide md:pr-2">
                <ThreadBody post={post} />
              </div>
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
