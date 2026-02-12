
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.ts";
import { motion, HTMLMotionProps } from "framer-motion";
import { buttonMotion } from "../../lib/motion.ts";
import { TOKENS } from "./tokens.ts";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: TOKENS.action.primary,
        secondary: TOKENS.action.secondary,
        ghost: TOKENS.action.ghost,
        icon: TOKENS.action.icon,
      },
      size: {
        default: "min-h-[44px] px-4 py-2",
        icon: "min-h-[44px] min-w-[44px] p-2 rounded-full",
        sm: "min-h-[36px] px-3 py-1 text-sm",
        lg: "min-h-[52px] px-6 py-3 text-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "className"> {
    asChild?: boolean;
    variant?: "primary" | "secondary" | "ghost" | "icon" | null;
    size?: "default" | "icon" | "sm" | "lg" | null;
    className?: string;
    children?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "default",
  className,
  children,
  ...props
}) => {
  return (
    <motion.button
      className={cn(buttonVariants({ variant, size, className }))}
      {...buttonMotion}
      {...props}
    >
      {children}
    </motion.button>
  );
};

export default Button;
