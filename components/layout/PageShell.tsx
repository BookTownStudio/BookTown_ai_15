
import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils.ts';

interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    scrollable?: boolean;
}

const PageShell = forwardRef<HTMLDivElement, PageShellProps>(({ 
    children, 
    className, 
    scrollable = true, 
    ...props 
}, ref) => {
    return (
        <div 
            ref={ref} 
            className={cn(
                // Viewport dimensions & Background
                "relative w-full h-screen h-[100dvh] bg-gray-50 dark:bg-slate-900",
                // Flex layout to prevent vertical collapse
                "flex flex-col",
                // Scrolling behavior
                scrollable 
                    ? "overflow-y-auto overflow-x-hidden scroll-smooth" 
                    : "overflow-hidden",
                // Mobile Safe Area handling for scrolling content
                scrollable && "pb-[env(safe-area-inset-bottom)]",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
});

PageShell.displayName = "PageShell";

export default PageShell;
