import React, { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { XIcon } from '../../components/icons/XIcon.tsx';
import Button from '../../components/ui/Button.tsx';
import ThreadComments from '../../components/content/ThreadComments.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { cn } from '../../lib/utils.ts';
import { Post, ThreadPost } from '../../types/entities.ts';
import { useQuery } from '../../lib/react-query.ts';
import { dataService } from '../../services/dataService.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';

/**
 * PostDiscussionScreen
 * Authoritative implementation of POST_DISCUSSION_SURFACE_IMPLEMENTATION_V1 (LOCKED).
 */
const PostDiscussionScreen: React.FC = () => {
  const { lang, isRTL } = useI18n();
  const { currentView, navigate } = useNavigation();
  const composerRef = useRef<HTMLInputElement>(null);

  const params = currentView.type === 'immersive' ? currentView.params : {};
  const postId = typeof params?.postId === 'string' ? params.postId.trim() : '';
  const prefetchedPost = params?.prefetchedPost as Post | undefined;

  const prefetchedForRoute =
    prefetchedPost && typeof prefetchedPost.id === 'string' && prefetchedPost.id === postId
      ? prefetchedPost
      : undefined;

  const {
    data: fetchedPost,
    isLoading: isPostLoading,
    isError: isPostError,
  } = useQuery<Post>({
    queryKey: ['social', 'post-discussion', postId],
    queryFn: () => dataService.social.getPost(postId),
    enabled: postId.length > 0,
    staleTime: 30000,
    ...(prefetchedForRoute ? { initialData: prefetchedForRoute } : {}),
  } as any);

  const sourcePost = fetchedPost || prefetchedForRoute;

  const handleBack = React.useCallback(() => {
    const fromView = params?.from;
    if (fromView && typeof window !== 'undefined') {
      window.history.back();
      return;
    }

    if (fromView) {
      navigate(fromView, { replace: true });
    } else {
      navigate({ type: 'tab', id: 'social' }, { replace: true });
    }
  }, [params?.from, navigate]);

  // -----------------------------
  // 🔒 HOOKS MUST BE UNCONDITIONAL
  // -----------------------------

  const threadPost: ThreadPost | null = useMemo(() => {
    if (!sourcePost) return null;

    return {
      id: sourcePost.id,
      authorId: sourcePost.authorId,
      authorName: sourcePost.authorName,
      authorHandle: sourcePost.authorHandle,
      authorAvatar: sourcePost.authorAvatar,
      createdAt: sourcePost.timestamps.createdAt,
      visibility: sourcePost.visibility,
      status: sourcePost.status,
      content: {
        text: sourcePost.content.text,
        attachments: sourcePost.content.attachments
      }
    };
  }, [sourcePost]);

  const timeLabel = useMemo(() => {
    if (!threadPost) return '';
    return new Date(threadPost.createdAt).toLocaleDateString(
      lang === 'ar' ? 'ar-EG' : 'en-US',
      { month: 'short', day: 'numeric' }
    );
  }, [threadPost, lang]);

  if (!postId) {
    return null;
  }

  const postUnavailable =
    (!isPostLoading && (!threadPost || isPostError)) ||
    (threadPost && threadPost.status !== 'published');

  const hasPrimaryAttachment =
    !!threadPost?.content?.attachments && threadPost.content.attachments.length > 0;

  return (
    <div
      className="h-screen w-full bg-gradient-to-b from-[#050a12] via-[#060d18] to-[#03060d] text-white"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="h-full w-full flex flex-col"
      >
        {isPostLoading && (
          <div className="flex-grow flex items-center justify-center">
            <LoadingSpinner />
          </div>
        )}

        {postUnavailable && !isPostLoading && (
          <div className="flex-grow flex items-center justify-center px-6">
            <div className="text-center">
              <BilingualText role="Body" className="text-sm opacity-70">
                {lang === 'en' ? 'Post unavailable.' : 'المنشور غير متاح.'}
              </BilingualText>
            </div>
          </div>
        )}

        {!isPostLoading && !postUnavailable && threadPost && (
          <>
            <header className="flex-shrink-0 px-4 md:px-6 pt-6 pb-4 border-b border-white/10 bg-black/20 backdrop-blur-md">
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
                    className="h-8 w-8 rounded-full object-cover border border-white/20"
                  />
                  <div className="min-w-0">
                    <BilingualText className="font-semibold text-[13px] text-white/85 truncate">
                      {threadPost.authorName}
                    </BilingualText>
                    <BilingualText role="Caption" className="!text-[10px] !text-white/52">
                      {threadPost.authorHandle} • {timeLabel}
                    </BilingualText>
                  </div>
                </div>

                <Button
                  variant="icon"
                  onClick={handleBack}
                  className="!bg-white/10 !text-white/80 !p-1.5 !h-8 !w-8 rounded-full border border-white/20"
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-3 rounded-2xl border border-white/12 bg-black/30 overflow-hidden">
                <div className="h-12 bg-gradient-to-r from-[#0a2235] via-[#17354d] to-[#0a1e2e] relative">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,119,182,0.35),transparent_58%)]" />
                  {hasPrimaryAttachment && (
                    <span className="absolute left-3 top-2.5 inline-flex items-center rounded-full border border-white/25 bg-black/40 px-2 py-0.5 text-[9px] font-bold tracking-[0.14em] text-white/75 uppercase">
                      {lang === 'en' ? 'Exhibition' : 'عرض'}
                    </span>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <BilingualText
                    role="Body"
                    className="text-[13px] leading-relaxed line-clamp-2 text-white/76"
                  >
                    {threadPost.content.text}
                  </BilingualText>
                </div>
              </div>
            </header>

            <div className="flex-grow overflow-y-auto">
              <div className="container mx-auto max-w-3xl min-h-full">
                <ThreadComments post={threadPost} composerRef={composerRef} />
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default PostDiscussionScreen;
