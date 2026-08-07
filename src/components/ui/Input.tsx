import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
  error?: string;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
}

export function Field({ label, htmlFor, children, error, labelProps }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-navy-700" {...labelProps}>
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100",
        className,
      )}
      {...rest}
    />
  );
}
