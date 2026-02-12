
import React from 'react';
import { cn } from '../../lib/utils.ts';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cardMotion } from '../../lib/motion.ts';

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disableAnimation?: boolean;
}

const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick, disableAnimation = false, ...props }) => {
  return (
    <motion.div
      onClick={onClick}
      className={cn(
        "glass-panel rounded-card p-5 transition-colors duration-300",
        onClick && "cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800/80",
        className
      )}
      {...(disableAnimation ? {} : cardMotion)}
      {...(onClick ? { whileTap: { scale: 0.98 } } : {})}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;
