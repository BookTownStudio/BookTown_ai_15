import React from 'react';
import { cn } from '../../lib/utils.ts';
import type {
  CanonicalCoverMode,
  CanonicalFallbackCover,
} from '../../types/entities.ts';

type CoverVariant = 'poster' | 'posterCompact' | 'landscape';

type CanonicalCoverArtworkProps = {
  title: string;
  author?: string;
  coverUrl?: string;
  coverMode?: CanonicalCoverMode;
  fallbackCover?: CanonicalFallbackCover;
  variant?: CoverVariant;
  className?: string;
  imageClassName?: string;
  alt?: string;
  eyebrow?: string;
};

const THEME_CLASSES: Record<CanonicalFallbackCover['theme'], string> = {
  ink: 'bg-[radial-gradient(circle_at_top_left,_rgba(196,165,121,0.28),_transparent_38%),linear-gradient(145deg,_#17181d_0%,_#2d313b_52%,_#7d6951_100%)]',
  emerald:
    'bg-[radial-gradient(circle_at_top_left,_rgba(125,211,184,0.28),_transparent_38%),linear-gradient(145deg,_#12211d_0%,_#1f4d45_50%,_#8ab694_100%)]',
  gold: 'bg-[radial-gradient(circle_at_top_left,_rgba(244,211,94,0.28),_transparent_38%),linear-gradient(145deg,_#2e2317_0%,_#6e5132_48%,_#d6be93_100%)]',
  plum: 'bg-[radial-gradient(circle_at_top_left,_rgba(216,180,254,0.26),_transparent_38%),linear-gradient(145deg,_#221627_0%,_#56315e_50%,_#b88fc1_100%)]',
};

function resolveFallbackCover(
  title: string,
  author?: string,
  fallbackCover?: CanonicalFallbackCover
): CanonicalFallbackCover {
  const normalizedTitle = fallbackCover?.title?.trim() || title.trim() || 'Untitled';
  const normalizedAuthor = fallbackCover?.author?.trim() || author?.trim() || '';
  return {
    title: normalizedTitle,
    ...(normalizedAuthor ? { author: normalizedAuthor } : {}),
    theme: fallbackCover?.theme || 'ink',
  };
}

export const CanonicalCoverArtwork: React.FC<CanonicalCoverArtworkProps> = ({
  title,
  author,
  coverUrl,
  coverMode,
  fallbackCover,
  variant = 'poster',
  className,
  imageClassName,
  alt,
  eyebrow,
}) => {
  const resolvedFallback = resolveFallbackCover(title, author, fallbackCover);
  const shouldRenderImage = Boolean(coverUrl && coverUrl.trim() && coverMode !== 'fallback_metadata');

  if (shouldRenderImage) {
    return (
      <img
        src={coverUrl}
        alt={alt || title}
        className={cn('h-full w-full object-cover', imageClassName, className)}
      />
    );
  }

  const titleClassName =
    variant === 'landscape'
      ? 'text-2xl md:text-[2.2rem]'
      : variant === 'posterCompact'
        ? 'text-sm'
        : 'text-xl md:text-2xl';
  const authorClassName =
    variant === 'landscape'
      ? 'mt-3 text-sm tracking-[0.14em]'
      : variant === 'posterCompact'
        ? 'mt-2 text-[10px] tracking-[0.18em]'
        : 'mt-3 text-xs tracking-[0.18em]';
  const eyebrowLabel =
    eyebrow || (variant === 'landscape' ? 'BookTown Longform' : 'BookTown Edition');

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden',
        THEME_CLASSES[resolvedFallback.theme],
        className
      )}
      aria-label={alt || title}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(12,12,12,0.08)_0%,_rgba(12,12,12,0.34)_100%)]" />
      <div
        className={cn(
          'relative flex h-full flex-col justify-end text-white',
          variant === 'landscape'
            ? 'px-8 py-7 md:px-10 md:py-9'
            : variant === 'posterCompact'
              ? 'px-3 py-3'
              : 'px-4 py-4 md:px-5 md:py-5'
        )}
      >
        <div
          className={cn(
            'uppercase text-white/70',
            variant === 'landscape'
              ? 'mb-3 text-[11px] tracking-[0.28em]'
              : 'mb-2 text-[9px] tracking-[0.22em]'
          )}
        >
          {eyebrowLabel}
        </div>
        <div className={cn('font-semibold leading-tight tracking-tight', titleClassName)}>
          {resolvedFallback.title}
        </div>
        {resolvedFallback.author ? (
          <div className={cn('uppercase text-white/72', authorClassName)}>
            {resolvedFallback.author}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CanonicalCoverArtwork;
