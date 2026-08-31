import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
    "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg]:text-current [&>svg+div]:translate-y-[-1px] [&>svg~*]:pl-7",
    {
        variants: {
            variant: {
                default: "bg-card text-card-foreground",
                info: "border-transparent bg-info-subtle text-info-subtle-foreground",
                success:
                    "border-transparent bg-success-subtle text-success-subtle-foreground",
                warning:
                    "border-transparent bg-warning-subtle text-warning-subtle-foreground",
                destructive:
                    "border-transparent bg-destructive-subtle text-destructive-subtle-foreground",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

const Alert = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
    <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
    />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h5
        ref={ref}
        className={cn("mb-1 font-medium leading-none tracking-tight", className)}
        {...props}
    />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("text-sm opacity-90 [&_p]:leading-relaxed", className)}
        {...props}
    />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
