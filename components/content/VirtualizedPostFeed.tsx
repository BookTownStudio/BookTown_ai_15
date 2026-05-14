import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PostCard from './PostCard.tsx';
import { Post } from '../../types/entities.ts';
import { cn } from '../../lib/utils.ts';
import {
    recordSocialPerformanceMetric,
    useSocialRenderDiagnostics,
} from '../../lib/socialPerformanceDiagnostics.ts';

const ESTIMATED_POST_HEIGHT = 560;
const OVERSCAN_PX = 1600;

type VirtualItem = {
    index: number;
    post: Post;
    top: number;
    height: number;
};

interface VirtualizedPostFeedProps {
    posts: Post[];
    scrollerRef: React.RefObject<HTMLDivElement>;
    className?: string;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    onFetchNextPage: () => void;
    onOpenThread: (post: Post) => void;
}

const readPostId = (post: Post): string => (typeof post?.id === 'string' ? post.id : '');

const VirtualizedPostRow = React.memo(({
    index,
    isLast,
    item,
    onMeasured,
    onOpenThread,
}: {
    index: number;
    isLast: boolean;
    item: VirtualItem;
    onMeasured: (postId: string, height: number) => void;
    onOpenThread: (post: Post) => void;
}) => {
    const rowRef = useRef<HTMLDivElement | null>(null);
    const postId = readPostId(item.post);

    useEffect(() => {
        const node = rowRef.current;
        if (!node || !postId) return;

        const measure = () => {
            const nextHeight = Math.ceil(node.getBoundingClientRect().height);
            if (nextHeight > 0) {
                onMeasured(postId, nextHeight);
            }
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [onMeasured, postId]);

    const handleOpenThread = useCallback(() => {
        onOpenThread(item.post);
    }, [item.post, onOpenThread]);

    return (
        <div
            ref={rowRef}
            id={`post-${postId}`}
            data-post-id={postId}
            data-virtual-index={index}
            className={cn(
                "absolute left-0 right-0 w-full",
                index > 0 && "before:absolute before:top-0 before:left-4 before:right-4 before:h-px before:bg-white/[0.09] md:before:left-5 md:before:right-5"
            )}
            style={{ transform: `translateY(${item.top}px)` }}
        >
            <PostCard
                post={item.post}
                viewMode="list"
                onOpenDiscussion={handleOpenThread}
            />
            {isLast ? <div className="h-px w-full" aria-hidden="true" /> : null}
        </div>
    );
});

VirtualizedPostRow.displayName = 'VirtualizedPostRow';

const VirtualizedPostFeed: React.FC<VirtualizedPostFeedProps> = ({
    posts,
    scrollerRef,
    className,
    hasNextPage = false,
    isFetchingNextPage = false,
    onFetchNextPage,
    onOpenThread,
}) => {
    const heightsRef = useRef<Map<string, number>>(new Map());
    const fetchRequestedRef = useRef(false);
    const [scrollState, setScrollState] = useState({ top: 0, height: 900 });
    const [measureVersion, setMeasureVersion] = useState(0);
    useSocialRenderDiagnostics('VirtualizedPostFeed', {
        hasNextPage,
        postCount: posts.length,
        surface: 'feed',
    });

    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;

        let frameId = 0;
        const readScroll = () => {
            frameId = 0;
            setScrollState({
                top: Math.max(0, scroller.scrollTop),
                height: Math.max(1, scroller.clientHeight || window.innerHeight || 900),
            });
        };

        const scheduleRead = () => {
            if (frameId) return;
            frameId = window.requestAnimationFrame(readScroll);
        };

        readScroll();
        scroller.addEventListener('scroll', scheduleRead, { passive: true });
        window.addEventListener('resize', scheduleRead, { passive: true });
        return () => {
            scroller.removeEventListener('scroll', scheduleRead);
            window.removeEventListener('resize', scheduleRead);
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, [scrollerRef]);

    const measuredLayout = useMemo(() => {
        let runningTop = 0;
        const items: VirtualItem[] = posts.map((post, index) => {
            const postId = readPostId(post);
            const height = heightsRef.current.get(postId) ?? ESTIMATED_POST_HEIGHT;
            const item = { index, post, top: runningTop, height };
            runningTop += height;
            return item;
        });

        return { items, totalHeight: runningTop };
    }, [measureVersion, posts]);

    const virtualItems = useMemo(() => {
        const minTop = Math.max(0, scrollState.top - OVERSCAN_PX);
        const maxTop = scrollState.top + scrollState.height + OVERSCAN_PX;

        return measuredLayout.items.filter((item) => (
            item.top + item.height >= minTop && item.top <= maxTop
        ));
    }, [measuredLayout.items, scrollState.height, scrollState.top]);

    useEffect(() => {
        recordSocialPerformanceMetric('social_feed_virtualization', {
            isFetchingNextPage,
            mountedCount: virtualItems.length,
            postCount: posts.length,
            totalHeight: measuredLayout.totalHeight,
            viewportHeight: scrollState.height,
        });
    }, [
        isFetchingNextPage,
        measuredLayout.totalHeight,
        posts.length,
        scrollState.height,
        virtualItems.length,
    ]);

    const handleMeasured = useCallback((postId: string, height: number) => {
        const current = heightsRef.current.get(postId);
        if (current && Math.abs(current - height) < 2) return;
        heightsRef.current.set(postId, height);
        setMeasureVersion((version) => version + 1);
    }, []);

    useEffect(() => {
        if (!hasNextPage || isFetchingNextPage || fetchRequestedRef.current) return;
        const remaining = measuredLayout.totalHeight - (scrollState.top + scrollState.height);
        if (remaining > 1800) return;

        fetchRequestedRef.current = true;
        onFetchNextPage();
    }, [
        hasNextPage,
        isFetchingNextPage,
        measuredLayout.totalHeight,
        onFetchNextPage,
        scrollState.height,
        scrollState.top,
    ]);

    useEffect(() => {
        if (!isFetchingNextPage) {
            fetchRequestedRef.current = false;
        }
    }, [isFetchingNextPage]);

    return (
        <div
            className={cn("relative w-full", className)}
            style={{ height: measuredLayout.totalHeight || 1 }}
            data-virtualized-feed="true"
            data-mounted-count={virtualItems.length}
            data-total-count={posts.length}
        >
            {virtualItems.map((item) => (
                <VirtualizedPostRow
                    key={readPostId(item.post) || item.index}
                    index={item.index}
                    isLast={item.index === posts.length - 1}
                    item={item}
                    onMeasured={handleMeasured}
                    onOpenThread={onOpenThread}
                />
            ))}
        </div>
    );
};

export default React.memo(VirtualizedPostFeed);
