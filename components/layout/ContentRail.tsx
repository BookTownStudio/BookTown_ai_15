import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils.ts';

export type ContentRailVariant = 'default' | 'narrow' | 'wide' | 'admin';

interface ContentRailProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: ContentRailVariant;
}

const variantClassName: Record<ContentRailVariant, string> = {
  default: 'app-rail--default',
  narrow: 'app-rail--narrow',
  wide: 'app-rail--wide',
  admin: 'app-rail--admin',
};

const ContentRail = forwardRef<HTMLDivElement, ContentRailProps>(
  ({ className, children, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('app-rail', variantClassName[variant], className)}
      {...props}
    >
      {children}
    </div>
  )
);

ContentRail.displayName = 'ContentRail';

export default ContentRail;
