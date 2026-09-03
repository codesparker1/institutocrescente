"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  href: string;
  label: string;
  icon: ReactNode;
}

export function NavItem({ href, label, icon }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive ? "bg-navy-800 text-gold-300" : "text-texto-suave hover:bg-navy-900 hover:text-gold-200",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
