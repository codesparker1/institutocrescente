"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { Role } from "@/generated/prisma/client";

interface DashboardShellProps {
  role: Role;
  name: string;
  children: ReactNode;
}

export function DashboardShell({ role, name, children }: DashboardShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const openMobileNav = useCallback(() => setIsMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setIsMobileNavOpen(false), []);

  return (
    <div className="flex min-h-screen bg-navy-50/40">
      <Sidebar role={role} isOpen={isMobileNavOpen} onClose={closeMobileNav} />
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <Topbar name={name} role={role} onMenuClick={openMobileNav} />
        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
