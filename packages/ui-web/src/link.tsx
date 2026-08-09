import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./cn";

export const linkVariants = cva(
  "rounded-sm font-medium underline-offset-4 transition-colors [transition-duration:var(--sm-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "text-primary hover:underline",
        muted: "text-muted-foreground hover:text-foreground hover:underline",
        standalone: "text-foreground no-underline hover:text-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface LinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof linkVariants> {}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, rel, target, variant, ...props }, ref) => (
    <a
      ref={ref}
      className={cn(linkVariants({ variant }), className)}
      rel={target === "_blank" ? (rel ?? "noopener noreferrer") : rel}
      target={target}
      {...props}
    />
  ),
);
Link.displayName = "Link";
