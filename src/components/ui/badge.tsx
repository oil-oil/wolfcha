import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-accent)] text-[var(--text-inverse)] hover:bg-[#a07608]",
        secondary:
          "border-transparent bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]",
        destructive:
          "border-transparent bg-[var(--color-danger)] text-[var(--text-inverse)] hover:bg-[#721818]",
        outline: "border-[var(--border-color)] text-[var(--text-primary)]",
        success:
          "border-transparent bg-[var(--color-success)] text-[var(--text-inverse)] hover:bg-[#234a1f]",
        warning:
          "border-transparent bg-[var(--color-warning)] text-[var(--text-inverse)] hover:bg-[#7a5011]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
