import type { ReactNode } from "react";
import { Card } from "./Card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  hint?: string;
}

export function StatCard({ label, value, icon, hint }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4 px-5 py-4">
      {icon ? (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">{label}</p>
        <p className="text-2xl font-bold text-texto">{value}</p>
        {hint ? <p className="text-xs text-texto-suave">{hint}</p> : null}
      </div>
    </Card>
  );
}
