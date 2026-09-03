import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-texto-suave">{children}</thead>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 font-semibold", className)}>{children}</th>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-navy-50">{children}</tbody>;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("hover:bg-navy-50/50", className)}>{children}</tr>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 text-texto", className)}>{children}</td>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm text-texto-suave">{message}</p>
    </div>
  );
}
