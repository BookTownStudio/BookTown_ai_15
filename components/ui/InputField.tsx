import * as React from "react";
import { cn } from "../../lib/utils.ts";
import { useI18n } from "../../store/i18n.tsx";
import BilingualText from "./BilingualText.tsx";

export interface InputFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ className, type, id, label, startIcon, endIcon, ...props }, ref) => {
    const { isRTL } = useI18n();

    const paddingStartClass = startIcon ? (isRTL ? "pr-10" : "pl-10") : (isRTL ? "pr-3" : "pl-3");
    const paddingEndClass = endIcon ? (isRTL ? "pl-10" : "pr-10") : (isRTL ? "pr-3" : "pr-3");

    return (
      <div>
        <label htmlFor={id}>
          <BilingualText
            role="Caption"
            className="!text-slate-400 dark:!text-slate-400 mb-1 block"
          >
            {label}
          </BilingualText>
        </label>
        <div className="relative">
          {startIcon && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 ${
                isRTL ? "right-3" : "left-3"
              } pointer-events-none z-10`}
            >
              {startIcon}
            </div>
          )}
          <input
            id={id}
            type={type}
            dir={isRTL ? "rtl" : "ltr"}
            className={cn(
              "flex h-12 w-full rounded-md border border-slate-600 bg-slate-800 py-2 text-white ring-offset-background file:border-0 file:bg-transparent placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50",
              paddingStartClass,
              paddingEndClass,
              className
            )}
            ref={ref}
            {...props}
          />
          {endIcon && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 ${
                isRTL ? "left-3" : "right-3"
              }`}
            >
              {endIcon}
            </div>
          )}
        </div>
      </div>
    );
  }
);
InputField.displayName = "InputField";

export default InputField;