import * as React from "react";

import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, disabled, onCheckedChange, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onCheckedChange?.(!checked);
        }}
        className={cn(
          "inline-flex h-6 w-11 items-center rounded-full border transition-colors",
          checked
            ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
            : "bg-[var(--bg-secondary)] border-[var(--border-color)]",
          disabled && "opacity-40 cursor-not-allowed",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-[var(--text-inverse)] shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </button>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
