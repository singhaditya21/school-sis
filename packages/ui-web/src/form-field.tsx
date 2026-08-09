import * as React from "react";

import { cn } from "./cn";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true" | "grammar" | "spelling";
};

export interface FormFieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children: React.ReactElement<FieldControlProps>;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label: React.ReactNode;
  required?: boolean;
}

export function FormField({
  children,
  className,
  description,
  error,
  label,
  required = false,
  ...props
}: FormFieldProps) {
  const generatedId = React.useId();
  const controlId = children.props.id ?? `field-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], descriptionId, errorId]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className={cn("grid gap-2", className)} {...props}>
      <label htmlFor={controlId} className="text-sm font-medium leading-none text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive" aria-hidden="true">*</span> : null}
      </label>
      {React.cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })}
      {description ? (
        <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
