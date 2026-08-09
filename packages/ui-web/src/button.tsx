"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./cn";

export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] [transition-duration:var(--sm-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-[var(--sm-elevation-sm)] hover:bg-[var(--sm-color-primary-hover)] active:translate-y-px",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[var(--sm-elevation-sm)] hover:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--sm-elevation-sm)] hover:opacity-90",
        outline:
          "border border-input bg-background text-foreground shadow-[var(--sm-elevation-sm)] hover:bg-accent hover:text-accent-foreground",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "min-h-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "min-h-9 px-3 text-xs",
        md: "px-4 py-2",
        lg: "min-h-12 px-6 text-base",
        icon: "size-11 shrink-0 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, type, variant, size, ...props }, ref) => {
    const Component = asChild ? Slot : "button";

    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "aria-label"> {
  /** Required because an icon-only control has no visible accessible name. */
  label: string;
  size?: "sm" | "md" | "lg";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, className, label, size = "md", title, ...props }, ref) => (
    <Button
      ref={ref}
      size="icon"
      aria-label={label}
      title={title ?? label}
      className={cn(
        size === "sm" && "size-9 min-h-9",
        size === "lg" && "size-12 min-h-12",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        {children}
      </span>
    </Button>
  ),
);
IconButton.displayName = "IconButton";
