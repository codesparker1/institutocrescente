import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-navy-50 text-texto",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-gold-100 text-gold-800",
  danger: "bg-red-50 text-red-700",
  info: "bg-navy-100 text-texto",
};

export function Badge({ children, tone = "neutral", className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
