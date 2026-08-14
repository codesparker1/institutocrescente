"use client";

import { LogOut, Menu } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import type { Role } from "@/generated/prisma/client";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  SECRETARIA: "Secretaria",
  DAAC: "DAAC",
  PROFESSOR: "Professor",
  ALUNO: "Aluno",
};

interface TopbarProps {
  name: string;
  role: Role;
  onMenuClick: () => void;
}

export function Topbar({ name, role, onMenuClick }: TopbarProps) {
  return (
    <header className="flex items-center justify-between border-b border-navy-100 bg-white px-4 py-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg border border-navy-100 p-2 text-navy-600 hover:bg-navy-50 md:hidden"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold text-navy-900">{name}</p>
          <p className="text-xs text-navy-400">{ROLE_LABEL[role]}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg border border-navy-100 px-3 py-1.5 text-xs font-semibold text-navy-600 hover:bg-navy-50"
          >
            <LogOut size={14} />
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
