
import React from 'react';
import { cn } from '../../lib/utils.ts';
import { TOKENS } from './tokens.ts';

interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variant?: 'body' | 'muted';
}

export const Text: React.FC<TextProps> = ({ className, children, variant = 'body', ...props }) => {
  const token = variant === 'muted' ? TOKENS.text.muted : TOKENS.text.body;
  return (
    <p className={cn(token, className)} {...props}>
      {children}
    </p>
  );
};

export default Text;
