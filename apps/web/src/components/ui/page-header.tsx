import * as React from "react"

import { cn } from "@/lib/utils"

export interface PageHeaderProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    title: React.ReactNode
    description?: React.ReactNode
    /** Right-aligned actions (buttons, menus). */
    actions?: React.ReactNode
}

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
    ({ className, title, description, actions, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between",
                className
            )}
            {...props}
        >
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
                    {title}
                </h1>
                {description ? (
                    <p className="text-sm text-muted-foreground">{description}</p>
                ) : null}
            </div>
            {actions ? (
                <div className="flex shrink-0 items-center gap-2">{actions}</div>
            ) : null}
        </div>
    )
)
PageHeader.displayName = "PageHeader"

export { PageHeader }
