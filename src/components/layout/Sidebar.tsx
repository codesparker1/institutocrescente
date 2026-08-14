"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, GraduationCap, Layers, ScrollText, CalendarClock, ClipboardList, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { NavItem } from "./NavItem";
import { NavGroup } from "./NavGroup";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/client";

interface SidebarProps {
  role: Role;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ role, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-30 bg-navy-950/60 md:hidden" onClick={onClose} aria-hidden="true" />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-navy-800 bg-navy-950 px-4 py-6 transition-transform duration-200 ease-out md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-2 pb-6">
          <Logo size={44} priority />
        </div>
        <nav className="flex flex-col gap-1">
          {role === "ADMIN" ? <AdminNav /> : null}
          {role === "SECRETARIA" ? <SecretariaNav /> : null}
          {role === "PROFESSOR" ? <ProfessorNav /> : null}
          {role === "ALUNO" ? <AlunoNav /> : null}
        </nav>
      </aside>
    </>
  );
}

// Página Inicial (ou equivalente) vem sempre primeiro; os restantes itens seguem ordem alfabética por label.
function AdminNav() {
  return (
    <>
      <NavItem href="/dashboard" label="Página Inicial" icon={<LayoutDashboard size={18} />} />
      <NavGroup
        label="Gestão Académica"
        icon={<Layers size={18} />}
        items={[
          { href: "/admin/cursos", label: "Cursos" },
          { href: "/admin/disciplinas", label: "Disciplinas" },
          { href: "/admin/curriculo", label: "Plano Curricular" },
          { href: "/admin/turmas", label: "Turmas" },
          { href: "/admin/emolumentos", label: "Emolumentos" },
        ]}
      />
      <NavItem href="/horario" label="Horário e Provas" icon={<CalendarClock size={18} />} />
      <NavItem href="/notas" label="Notas e Frequência" icon={<GraduationCap size={18} />} />
      <NavGroup
        label="Financeiro"
        icon={<Wallet size={18} />}
        items={[
          { href: "/financeiro/registo", label: "Registo de Pagamentos" },
          { href: "/financeiro/devedores", label: "Lista de Devedores" },
          { href: "/admin/financeiro/configuracao", label: "Configuração" },
        ]}
      />
      <NavItem href="/auditoria" label="Registo de Auditoria" icon={<ScrollText size={18} />} />
      <NavGroup
        label="Usuários"
        icon={<Users size={18} />}
        items={[
          { href: "/admin/professores", label: "Professores" },
          { href: "/alunos", label: "Alunos" },
        ]}
      />
    </>
  );
}

function SecretariaNav() {
  return (
    <>
      <NavItem href="/dashboard" label="Página Inicial" icon={<LayoutDashboard size={18} />} />
      <NavItem href="/alunos" label="Alunos" icon={<Users size={18} />} />
      <NavGroup
        label="Financeiro"
        icon={<Wallet size={18} />}
        items={[
          { href: "/financeiro/registo", label: "Registo de Pagamentos" },
          { href: "/financeiro/devedores", label: "Lista de Devedores" },
        ]}
      />
    </>
  );
}

function ProfessorNav() {
  return (
    <>
      <NavItem href="/dashboard" label="Página Inicial" icon={<LayoutDashboard size={18} />} />
      <NavItem href="/professor" label="Minhas Disciplinas" icon={<GraduationCap size={18} />} />
      <NavItem href="/horario" label="Meu Horário" icon={<CalendarClock size={18} />} />
    </>
  );
}

function AlunoNav() {
  return (
    <>
      <NavItem href="/dashboard" label="Página Inicial" icon={<LayoutDashboard size={18} />} />
      <NavItem href="/horario" label="Meu Horário" icon={<CalendarClock size={18} />} />
      <NavItem href="/minhas-notas" label="Minhas Notas" icon={<ClipboardList size={18} />} />
      <NavItem href="/financeiro" label="Minhas Propinas" icon={<Wallet size={18} />} />
    </>
  );
}
