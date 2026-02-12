
import React from 'react';
import { cn } from '../../lib/utils.ts';
import { TOKENS } from './tokens.ts';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card: React.FC<CardProps> = ({ className, children, ...props }) => {
  return (
    <div className={cn(TOKENS.surface.card, "p-4 md:p-6", className)} {...props}>
      {children}
    </div>
  );
};

export default Card;
