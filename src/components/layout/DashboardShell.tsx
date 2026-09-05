"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AcessibilidadeProvider } from "./AcessibilidadeContext";
import type { Role } from "@/generated/prisma/client";

interface DashboardShellProps {
  role: Role;
  name: string;
  /** Data corrente do sistema (getAgora) — simulada sob SIMULATION_MODE, real fora dela. */
  dataSistema: Date;
  simulationMode: boolean;
  /** Aluno inscrito numa monografia — governa o item "Finalista" no menu. */
  temMonografia?: boolean;
  children: ReactNode;
}

export function DashboardShell({ role, name, dataSistema, simulationMode, temMonografia, children }: DashboardShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const openMobileNav = useCallback(() => setIsMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setIsMobileNavOpen(false), []);

  return (
    <AcessibilidadeProvider>
      <div className="flex min-h-screen bg-navy-50/40">
        <Sidebar role={role} isOpen={isMobileNavOpen} onClose={closeMobileNav} simulationMode={simulationMode} temMonografia={temMonografia} />
        <div className="flex min-w-0 flex-1 flex-col md:pl-64">
          <Topbar name={name} role={role} dataSistema={dataSistema} simulationMode={simulationMode} onMenuClick={openMobileNav} />
          <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </AcessibilidadeProvider>
  );
}
