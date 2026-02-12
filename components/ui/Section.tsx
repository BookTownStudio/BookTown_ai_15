
import React from 'react';
import { cn } from '../../lib/utils.ts';
import { TOKENS } from './tokens.ts';

interface SectionProps extends React.HTMLAttributes<HTMLElement> {}

export const Section: React.FC<SectionProps> = ({ className, children, ...props }) => {
  return (
    <section className={cn(TOKENS.layout.section, className)} {...props}>
      {children}
    </section>
  );
};

export default Section;
