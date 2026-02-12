// components/ui/StarRatingInput.tsx

import React, { useCallback, useMemo } from 'react';
import { cn } from '../../lib/utils.ts';
import { StarIcon } from '../icons';

/**
 * StarRatingInput
 * ----------------------------------------------------
 * Interactive star rating component.
 *
 * Contract:
 * - rating: number (0..5) supports halves if allowHalf=true
 * - onRatingChange: (next: number) => void
 *
 * Notes:
 * - Uses pointer events (works for mouse + touch) to avoid
 *   onTouchStart/onClick race conditions on mobile.
 * - Uses nativeEvent coords for reliable calculations.
 */

type StarRatingInputSize = 'sm' | 'md' | 'lg';

interface StarRatingInputProps {
  rating: number;
  onRatingChange: (next: number) => void;
  size?: StarRatingInputSize;
  max?: number;
  allowHalf?: boolean;
  disabled?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<StarRatingInputSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function StarRatingInput({
  rating,
  onRatingChange,
  size = 'md',
  max = 5,
  allowHalf = false,
  disabled = false,
  className,
}: StarRatingInputProps) {
  const stars = useMemo(() => Array.from({ length: max }, (_, i) => i + 1), [max]);

  const computeValueFromPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();

      // Prefer nativeEvent for coordinate precision across devices.
      const clientX =
        (e.nativeEvent as PointerEvent)?.clientX ?? (e as any)?.clientX ?? rect.left;

      const x = clamp(clientX - rect.left, 0, rect.width);
      const ratio = rect.width > 0 ? x / rect.width : 0;

      const raw = ratio * max;

      // Convert to [0..max], with half-steps if enabled.
      const stepped = allowHalf ? Math.round(raw * 2) / 2 : Math.round(raw);

      // Force minimum 0, maximum max.
      return clamp(stepped, 0, max);
    },
    [allowHalf, max]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;

      // Avoid parent click handlers or overlays affecting state.
      e.stopPropagation();
      e.preventDefault();

      // Capture so pointerup/move remain consistent if needed later.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      const next = computeValueFromPointer(e);
      onRatingChange(next);
    },
    [computeValueFromPointer, disabled, onRatingChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      // Keyboard accessibility (simple)
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        onRatingChange(clamp((rating ?? 0) + (allowHalf ? 0.5 : 1), 0, max));
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        onRatingChange(clamp((rating ?? 0) - (allowHalf ? 0.5 : 1), 0, max));
      }
      if (e.key === 'Home') {
        e.preventDefault();
        onRatingChange(0);
      }
      if (e.key === 'End') {
        e.preventDefault();
        onRatingChange(max);
      }
    },
    [allowHalf, disabled, max, onRatingChange, rating]
  );

  return (
    <div
      role="slider"
      aria-label="Rating"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={rating ?? 0}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex items-center gap-1 select-none',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
      onPointerDown={handlePointerDown}
    >
      {stars.map(star => {
        const filled = (rating ?? 0) >= star;
        const halfFilled = allowHalf && (rating ?? 0) >= star - 0.5 && (rating ?? 0) < star;

        return (
          <span key={star} className="relative inline-flex">
            {/* Base (empty) */}
            <StarIcon className={cn(SIZE_CLASSES[size], 'text-white/25')} />

            {/* Filled overlay */}
            {(filled || halfFilled) && (
              <span
                className={cn(
                  'absolute inset-0 overflow-hidden',
                  halfFilled ? 'w-1/2' : 'w-full'
                )}
              >
                <StarIcon className={cn(SIZE_CLASSES[size], 'text-yellow-400 fill-current')} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}