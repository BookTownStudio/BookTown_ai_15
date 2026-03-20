import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils.ts';

interface LiteraryShellProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const LiteraryShell = forwardRef<HTMLDivElement, LiteraryShellProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('mx-auto w-full max-w-[920px] px-4 md:px-6', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

LiteraryShell.displayName = 'LiteraryShell';

export default LiteraryShell;
