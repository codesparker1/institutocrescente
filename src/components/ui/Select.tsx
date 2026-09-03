import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm text-texto focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100",
        className,
      )}
      {...rest}
    />
  );
}
