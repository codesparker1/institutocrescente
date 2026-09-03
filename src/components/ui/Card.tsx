import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-navy-100 bg-white shadow-sm shadow-navy-900/5",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-navy-50 px-5 py-4", className)}>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-texto">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-texto-suave">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className }: CardProps) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
