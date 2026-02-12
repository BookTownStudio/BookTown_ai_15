
import React from 'react';
import { cn } from '../../lib/utils.ts';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/10", className)}
      {...props}
    />
  );
};

export default Skeleton;
