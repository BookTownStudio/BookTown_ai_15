import React, { forwardRef } from 'react';
import ContentRail from './ContentRail.tsx';

interface LiteraryShellProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const LiteraryShell = forwardRef<HTMLDivElement, LiteraryShellProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <ContentRail
        ref={ref}
        variant="default"
        className={className}
        {...props}
      >
        {children}
      </ContentRail>
    );
  }
);

LiteraryShell.displayName = 'LiteraryShell';

export default LiteraryShell;
