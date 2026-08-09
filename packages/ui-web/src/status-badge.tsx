import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./cn";

const statusBadgeVariants = cva(
  "inline-flex w-fit items-center rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold leading-none",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-secondary-foreground",
        info: "bg-[var(--sm-color-info)] text-[var(--sm-color-info-foreground)]",
        success: "bg-[var(--sm-color-success)] text-[var(--sm-color-success-foreground)]",
        warning: "bg-[var(--sm-color-warning)] text-[var(--sm-color-warning-foreground)]",
        danger: "bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {}

export function StatusBadge({ className, tone, ...props }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ tone }), className)} {...props} />;
}
