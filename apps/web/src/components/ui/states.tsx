import * as React from "react"

import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

/**
 * The three states every data surface needs, styled once so they stop being
 * hand-rolled per page: empty, loading, and error.
 */

export interface EmptyStateProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    icon?: React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    /** Primary action(s), e.g. a "Create" button. */
    action?: React.ReactNode
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
    ({ className, icon, title, description, action, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center",
                className
            )}
            {...props}
        >
            {icon ? (
                <div className="mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground [&>svg]:size-6">
                    {icon}
                </div>
            ) : null}
            <p className="text-base font-medium text-foreground text-balance">{title}</p>
            {description ? (
                <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
                    {description}
                </p>
            ) : null}
            {action ? <div className="mt-5">{action}</div> : null}
        </div>
    )
)
EmptyState.displayName = "EmptyState"

export interface ErrorStateProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    title?: React.ReactNode
    description?: React.ReactNode
    action?: React.ReactNode
}

const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
    (
        {
            className,
            title = "Something went wrong",
            description = "We couldn't load this. Please try again.",
            action,
            ...props
        },
        ref
    ) => (
        <div
            ref={ref}
            role="alert"
            className={cn(
                "flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive-subtle px-6 py-12 text-center",
                className
            )}
            {...props}
        >
            <p className="text-base font-medium text-destructive-subtle-foreground text-balance">
                {title}
            </p>
            {description ? (
                <p className="mt-1 max-w-sm text-sm text-destructive-subtle-foreground/80 text-pretty">
                    {description}
                </p>
            ) : null}
            {action ? <div className="mt-5">{action}</div> : null}
        </div>
    )
)
ErrorState.displayName = "ErrorState"

export interface LoadingStateProps
    extends React.HTMLAttributes<HTMLDivElement> {
    /** Number of skeleton rows to render. */
    rows?: number
}

const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
    ({ className, rows = 4, ...props }, ref) => (
        <div
            ref={ref}
            className={cn("space-y-3", className)}
            aria-busy="true"
            aria-live="polite"
            {...props}
        >
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-2/3" />
                    </div>
                </div>
            ))}
        </div>
    )
)
LoadingState.displayName = "LoadingState"

export { EmptyState, ErrorState, LoadingState }
