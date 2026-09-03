"use client";

import Link from "next/link";
import { CalendarDays, LogOut, Menu, UserCog } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import type { Role } from "@/generated/prisma/client";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  SECRETARIA: "Secretaria",
  DAAC: "DAAC",
  PROFESSOR: "Professor",
  ALUNO: "Aluno",
  DEV: "Responsável Técnico",
};

interface TopbarProps {
  name: string;
  role: Role;
  /** Data corrente do sistema (getAgora) — a simulada quando SIMULATION_MODE, a real fora dela. */
  dataSistema: Date;
  simulationMode: boolean;
  onMenuClick: () => void;
}

export function Topbar({ name, role, dataSistema, simulationMode, onMenuClick }: TopbarProps) {
  // dd/mm/aaaa fixo em pt-PT — não depende do locale do browser, para a data que o servidor
  // considera corrente ser lida da mesma forma por toda a gente (§verificação do relógio simulado).
  const dataFormatada = dataSistema.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <header className="flex items-center justify-between border-b border-navy-100 bg-white px-4 py-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg border border-navy-100 p-2 text-texto hover:bg-navy-50 md:hidden"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-4">
        <div
          className={
            simulationMode
              ? "flex items-center gap-1.5 rounded-lg border border-gold-300 bg-gold-50 px-3 py-1.5 text-xs font-semibold text-gold-700"
              : "flex items-center gap-1.5 rounded-lg border border-navy-100 px-3 py-1.5 text-xs font-semibold text-texto"
          }
          title={simulationMode ? "Data simulada — o relógio do sistema está sob controlo do modo de simulação" : "Data do sistema"}
        >
          <CalendarDays size={14} />
          <span className="tabular-nums">{dataFormatada}</span>
          {simulationMode ? <span className="hidden sm:inline">· simulado</span> : null}
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-texto">{name}</p>
          <p className="text-xs text-texto-suave">{ROLE_LABEL[role]}</p>
        </div>
        <Link
          href="/conta"
          className="flex items-center gap-1.5 rounded-lg border border-navy-100 px-3 py-1.5 text-xs font-semibold text-texto hover:bg-navy-50"
          aria-label="Minha Conta"
          title="Minha Conta"
        >
          <UserCog size={14} />
          Minha Conta
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg border border-navy-100 px-3 py-1.5 text-xs font-semibold text-texto hover:bg-navy-50"
          >
            <LogOut size={14} />
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
