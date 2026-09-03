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
        // navy-300 (claro), NÃO os tokens text-texto/-suave: a sidebar tem fundo escuro, e o preto
        // que se aplicou ao resto da app (§2026-09-03) tornou estes itens quase invisíveis aqui.
        isActive ? "bg-navy-800 text-gold-300" : "text-navy-300 hover:bg-navy-900 hover:text-gold-200",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
