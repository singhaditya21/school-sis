import * as React from "react";

import { Card } from "./card";
import { cn } from "./cn";

export interface MetricCardProps extends Omit<React.ComponentPropsWithoutRef<typeof Card>, "title"> {
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  label: React.ReactNode;
  trend?: React.ReactNode;
  value: React.ReactNode;
}

export function MetricCard({
  className,
  detail,
  icon,
  label,
  trend,
  value,
  ...props
}: MetricCardProps) {
  return (
    <Card className={cn("p-5", className)} {...props}>
      <dl className="grid gap-3">
        <div className="flex items-start justify-between gap-4">
          <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
          {icon ? <span aria-hidden="true" className="text-muted-foreground">{icon}</span> : null}
        </div>
        <dd className="font-mono text-3xl font-semibold tracking-tight text-foreground">{value}</dd>
      </dl>
      {trend || detail ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {trend ? <span className="font-medium text-foreground">{trend}</span> : null}
          {detail ? <span className="text-muted-foreground">{detail}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}
