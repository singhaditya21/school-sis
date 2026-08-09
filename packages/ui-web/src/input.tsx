import * as React from "react";

import { cn } from "./cn";

const controlClassName =
  "w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-[var(--sm-elevation-sm)] outline-none transition-[border-color,box-shadow] [transition-duration:var(--sm-motion-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 motion-reduce:transition-none";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(controlClassName, "min-h-11", className)} {...props} />
  ),
);
Input.displayName = "Input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlClassName, "min-h-24 resize-y py-2.5", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
