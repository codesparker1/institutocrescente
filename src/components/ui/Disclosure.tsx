import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface DisclosureProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Tabela grande "escondida" atrás de um clique — mesmo visual do Card/CardHeader, mas em `<details>` nativo (sem JS). */
export function Disclosure({ title, subtitle, children, defaultOpen = false }: DisclosureProps) {
  return (
    <details className="group rounded-xl border border-navy-100 bg-white shadow-sm shadow-navy-900/5" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-700">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-navy-400">{subtitle}</p> : null}
        </div>
        <ChevronDown size={18} className="shrink-0 text-navy-400 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-navy-50 px-5 py-4">{children}</div>
    </details>
  );
}
