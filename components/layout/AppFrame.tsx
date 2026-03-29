import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils.ts';

type AppFrameStyle = React.CSSProperties & {
  '--app-shell-max'?: string;
  '--app-shell-padding-inline'?: string;
  '--app-rail-default'?: string;
  '--app-rail-narrow'?: string;
  '--app-rail-wide'?: string;
  '--app-rail-admin'?: string;
};

interface AppFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const AppFrame = forwardRef<HTMLDivElement, AppFrameProps>(
  ({ className, style, children, ...props }, ref) => {
    const shellStyle: AppFrameStyle = {
      '--app-shell-max': '1280px',
      '--app-shell-padding-inline': 'clamp(16px, 2.5vw, 32px)',
      '--app-rail-default': '920px',
      '--app-rail-narrow': '760px',
      '--app-rail-wide': '1040px',
      '--app-rail-admin': '1160px',
      ...(style ?? {}),
    };

    return (
      <div
        ref={ref}
        className={cn('app-frame', className)}
        style={shellStyle}
        {...props}
      >
        {children}
      </div>
    );
  }
);

AppFrame.displayName = 'AppFrame';

export default AppFrame;
