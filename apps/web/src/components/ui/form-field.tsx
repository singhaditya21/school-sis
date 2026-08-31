import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "./label"

export interface FormFieldProps {
    label: React.ReactNode
    /** The control element (Input, Select trigger, Textarea…). */
    children: React.ReactElement
    /** Explicit id; otherwise one is generated and wired to the control. */
    htmlFor?: string
    hint?: React.ReactNode
    error?: React.ReactNode
    required?: boolean
    className?: string
}

/**
 * Label + control + hint/error with the aria wiring done for you: the label's
 * htmlFor, the control's id, aria-describedby (hint/error) and aria-invalid are
 * all connected, so accessible forms stop being copy-pasted per screen.
 */
function FormField({
    label,
    children,
    htmlFor,
    hint,
    error,
    required,
    className,
}: FormFieldProps) {
    const generatedId = React.useId()
    const id = htmlFor ?? (children.props as { id?: string }).id ?? generatedId
    const hintId = hint ? `${id}-hint` : undefined
    const errorId = error ? `${id}-error` : undefined
    const describedBy =
        [errorId, hintId].filter(Boolean).join(" ") || undefined

    const control = React.cloneElement(
        children,
        {
            id,
            "aria-describedby": describedBy,
            "aria-invalid": error ? true : undefined,
        } as React.HTMLAttributes<HTMLElement>
    )

    return (
        <div className={cn("space-y-1.5", className)}>
            <Label htmlFor={id}>
                {label}
                {required ? (
                    <span className="ml-0.5 text-destructive" aria-hidden="true">
                        *
                    </span>
                ) : null}
            </Label>
            {control}
            {error ? (
                <p id={errorId} className="text-xs font-medium text-destructive">
                    {error}
                </p>
            ) : hint ? (
                <p id={hintId} className="text-xs text-muted-foreground">
                    {hint}
                </p>
            ) : null}
        </div>
    )
}

export { FormField }
