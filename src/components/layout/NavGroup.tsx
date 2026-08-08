"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavGroupChild {
  href: string;
  label: string;
}

interface NavGroupProps {
  label: string;
  icon: ReactNode;
  items: NavGroupChild[];
}

export function NavGroup({ label, icon, items }: NavGroupProps) {
  const pathname = usePathname();
  const hasActiveChild = items.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          hasActiveChild ? "text-gold-300" : "text-navy-300 hover:bg-navy-900 hover:text-gold-200",
        )}
        aria-expanded={open}
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-1 flex flex-col gap-0.5 border-l border-navy-800 pl-4">
          {items.map((child) => {
            const isActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  isActive ? "bg-navy-800 text-gold-300" : "text-navy-400 hover:bg-navy-900 hover:text-gold-200",
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
