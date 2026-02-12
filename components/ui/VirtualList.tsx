
import React, { useRef, useState, useEffect } from 'react';

interface VirtualListProps<T> {
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    itemHeight: number;
    containerHeight: string;
    className?: string;
}

// Simplified virtualization for mobile performance
// Renders only visible items + buffer
const VirtualList = <T,>({ items, renderItem, itemHeight, containerHeight, className }: VirtualListProps<T>) => {
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const buffer = 5;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800; // fallback
    const visibleCount = Math.ceil(viewportHeight / itemHeight);
    
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const endIndex = Math.min(items.length, startIndex + visibleCount + 2 * buffer);

    const visibleItems = items.slice(startIndex, endIndex);
    const paddingTop = startIndex * itemHeight;
    const paddingBottom = (items.length - endIndex) * itemHeight;

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    return (
        <div 
            ref={containerRef}
            onScroll={handleScroll}
            className={`overflow-y-auto ${className}`}
            style={{ height: containerHeight }}
        >
            <div style={{ paddingTop, paddingBottom }}>
                {visibleItems.map((item, index) => renderItem(item, startIndex + index))}
            </div>
        </div>
    );
};

export default VirtualList;
