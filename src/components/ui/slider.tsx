import * as React from "react";

import { cn } from "@/lib/utils";

interface SliderProps extends Omit<React.ComponentPropsWithoutRef<"input">, "type"> {
  onValueChange?: (value: number) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, onChange, onValueChange, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event);
      onValueChange?.(Number(event.target.value));
    };

    return (
      <input
        ref={ref}
        type="range"
        className={cn(
          "w-full h-2 rounded-full bg-[var(--border-color)] accent-[var(--color-accent)] cursor-pointer",
          "disabled:cursor-not-allowed disabled:opacity-40",
          className
        )}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

Slider.displayName = "Slider";

export { Slider };
