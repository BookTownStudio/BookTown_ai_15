
import React from 'react';
import { cn } from '../../lib/utils.ts';
import { TOKENS } from './tokens.ts';

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const Heading: React.FC<HeadingProps> = ({ className, children, level = 1, ...props }) => {
  const Tag = `h${level}` as React.ElementType;
  const sizes = {
    1: "text-3xl md:text-4xl",
    2: "text-2xl md:text-3xl",
    3: "text-xl md:text-2xl",
    4: "text-lg md:text-xl",
    5: "text-base md:text-lg",
    6: "text-sm md:text-base",
  };
  
  return (
    <Tag className={cn(TOKENS.text.heading, sizes[level], className)} {...props}>
      {children}
    </Tag>
  );
};

export default Heading;
