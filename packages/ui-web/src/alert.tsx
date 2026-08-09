import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./cn";

const alertVariants = cva("grid gap-1 rounded-lg border px-4 py-3 text-sm", {
  variants: {
    tone: {
      info: "border-[var(--sm-color-info)] bg-[var(--sm-color-info-muted)] text-foreground",
      success: "border-[var(--sm-color-success)] bg-[var(--sm-color-success-muted)] text-foreground",
      warning: "border-[var(--sm-color-warning)] bg-[var(--sm-color-warning-muted)] text-foreground",
      danger: "border-destructive bg-[var(--sm-color-danger-muted)] text-foreground",
    },
  },
  defaultVariants: { tone: "info" },
});

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alertVariants> {
  title: React.ReactNode;
}

export function Alert({ children, className, title, tone, ...props }: AlertProps) {
  const urgent = tone === "danger";
  return (
    <div
      {...props}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      className={cn(alertVariants({ tone }), className)}
    >
      <p className="font-semibold">{title}</p>
      {children ? <div className="leading-relaxed text-muted-foreground">{children}</div> : null}
    </div>
  );
}
