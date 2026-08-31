import * as React from "react"

import { cn } from "@/lib/utils"
import { Card } from "./card"

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
    label: React.ReactNode
    value: React.ReactNode
    /** Optional supporting line under the value. */
    hint?: React.ReactNode
    /** Optional leading icon. */
    icon?: React.ReactNode
    /** Signed change indicator, e.g. "+12%". Sign drives the color. */
    delta?: string
    /** Force the delta color instead of inferring from the sign. */
    deltaIntent?: "up" | "down" | "neutral"
}

function inferDelta(delta?: string): "up" | "down" | "neutral" {
    if (!delta) return "neutral"
    if (/^\+|▲|↑/.test(delta.trim())) return "up"
    if (/^-|▼|↓/.test(delta.trim())) return "down"
    return "neutral"
}

const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
    ({ className, label, value, hint, icon, delta, deltaIntent, ...props }, ref) => {
        const dir = deltaIntent ?? inferDelta(delta)
        return (
            <Card ref={ref} className={cn("p-5", className)} {...props}>
                <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-muted-foreground">{label}</p>
                    {icon ? (
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground [&>svg]:size-5">
                            {icon}
                        </span>
                    ) : null}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                        {value}
                    </span>
                    {delta ? (
                        <span
                            className={cn(
                                "text-xs font-medium tabular-nums",
                                dir === "up" && "text-success",
                                dir === "down" && "text-destructive",
                                dir === "neutral" && "text-muted-foreground"
                            )}
                        >
                            {delta}
                        </span>
                    ) : null}
                </div>
                {hint ? (
                    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                ) : null}
            </Card>
        )
    }
)
MetricCard.displayName = "MetricCard"

export { MetricCard }
