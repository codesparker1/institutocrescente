import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-navy-700 text-gold-100 hover:bg-navy-800 focus-visible:outline-navy-700",
  secondary: "bg-gold-500 text-texto hover:bg-gold-600 focus-visible:outline-gold-600",
  ghost: "bg-transparent text-texto hover:bg-navy-50 focus-visible:outline-navy-300",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
};

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    />
  );
}
