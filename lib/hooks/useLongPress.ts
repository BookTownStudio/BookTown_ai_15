// FIX: Import `React` to make React types like `MouseEvent` available.
import React, { useCallback, useRef } from 'react';

const useLongPress = (
    onLongPress: (e: React.MouseEvent | React.TouchEvent) => void,
    onClick: (e: React.MouseEvent | React.TouchEvent) => void,
    { shouldPreventDefault = true, delay = 300 } = {}
) => {
    // FIX: Initialize useRef with null to provide the required initial value.
    const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    // FIX: Initialize useRef with null to provide the required initial value.
    const target = useRef<EventTarget | null>(null);

    const start = useCallback((event: React.MouseEvent | React.TouchEvent) => {
        if (shouldPreventDefault && event.target) {
            event.target.addEventListener('touchend', preventDefault, { passive: false });
            target.current = event.target;
        }
        timeout.current = setTimeout(() => {
            onLongPress(event);
        }, delay);
    }, [onLongPress, delay, shouldPreventDefault]);

    const clear = useCallback((event: React.MouseEvent | React.TouchEvent, shouldTriggerClick = true) => {
        timeout.current && clearTimeout(timeout.current);
        if (shouldTriggerClick && onClick) {
           onClick(event);
        }

        if (shouldPreventDefault && target.current) {
            target.current.removeEventListener('touchend', preventDefault);
        }
    }, [onClick, shouldPreventDefault]);

    const preventDefault = (e: Event) => {
        const isTouchEvent = (e: Event): e is TouchEvent => "touches" in e;

        if (!isTouchEvent(e)) return;
        
        if (e.touches.length < 2 && e.preventDefault) {
            e.preventDefault();
        }
    };

    return {
        onMouseDown: (e: React.MouseEvent) => start(e),
        onTouchStart: (e: React.TouchEvent) => start(e),
        onMouseUp: (e: React.MouseEvent) => clear(e),
        onMouseLeave: (e: React.MouseEvent) => clear(e, false),
        onTouchEnd: (e: React.TouchEvent) => clear(e),
    };
};

export default useLongPress;