import * as React from "react";

import { cn } from "./cn";
import { StatusBadge } from "./status-badge";

export interface StatePanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  action?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  tone?: "neutral" | "danger";
}

export function StatePanel({
  action,
  className,
  description,
  icon,
  title,
  tone = "neutral",
  ...props
}: StatePanelProps) {
  return (
    <div
      {...props}
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-8 text-center",
        tone === "danger" && "border-destructive/40 bg-[var(--sm-color-danger-muted)]",
        className,
      )}
    >
      {icon ? <span aria-hidden="true" className="text-muted-foreground">{icon}</span> : null}
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export type NamedStateProps = Omit<StatePanelProps, "tone">;

export function EmptyState(props: NamedStateProps) {
  return <StatePanel {...props} />;
}

export function ErrorState(props: NamedStateProps) {
  return <StatePanel tone="danger" {...props} />;
}

export function UnavailableState(props: NamedStateProps) {
  return <StatePanel {...props} />;
}

export interface LoadingStateProps extends Omit<NamedStateProps, "icon" | "title"> {
  title?: React.ReactNode;
}

export function LoadingState({ title = "Loading", ...props }: LoadingStateProps) {
  return (
    <StatePanel
      title={title}
      icon={
        <span className="block size-6 animate-spin rounded-full border-2 border-muted border-t-primary motion-reduce:animate-none" />
      }
      aria-live="polite"
      {...props}
    />
  );
}

export interface CapabilityStateBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  lifecycle: "INTERNAL" | "PILOT" | "UNAVAILABLE";
  message?: React.ReactNode;
}

const lifecycleCopy = {
  INTERNAL: "Internal preview",
  PILOT: "Pilot capability",
  UNAVAILABLE: "Unavailable",
} as const;

export function CapabilityStateBanner({
  className,
  lifecycle,
  message,
  ...props
}: CapabilityStateBannerProps) {
  const tone = lifecycle === "UNAVAILABLE" ? "warning" : "info";
  return (
    <div
      {...props}
      role="note"
      className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3", className)}
    >
      <StatusBadge tone={tone}>{lifecycleCopy[lifecycle]}</StatusBadge>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
