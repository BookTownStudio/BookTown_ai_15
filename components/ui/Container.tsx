
import React from 'react';
import { cn } from '../../lib/utils.ts';
import { TOKENS } from './tokens.ts';

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Container: React.FC<ContainerProps> = ({ className, children, ...props }) => {
  return (
    <div className={cn(TOKENS.layout.container, className)} {...props}>
      {children}
    </div>
  );
};

export default Container;
