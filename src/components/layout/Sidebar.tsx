import { LayoutDashboard, Users, GraduationCap, Layers, ScrollText, CalendarClock, ClipboardList } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { NavItem } from "./NavItem";
import { NavGroup } from "./NavGroup";
import type { Role } from "@/generated/prisma/client";

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-navy-800 bg-navy-950 px-4 py-6 md:flex">
      <div className="px-2 pb-6">
        <Logo size={36} />
      </div>
      <nav className="flex flex-col gap-1">
        {role === "ADMIN" ? <AdminNav /> : null}
        {role === "SECRETARIA" ? <SecretariaNav /> : null}
        {role === "PROFESSOR" ? <ProfessorNav /> : null}
        {role === "ALUNO" ? <AlunoNav /> : null}
      </nav>
    </aside>
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
          { href: "/admin/turmas", label: "Turmas" },
        ]}
      />
      <NavItem href="/horario" label="Horário e Provas" icon={<CalendarClock size={18} />} />
      <NavItem href="/notas" label="Notas e Frequência" icon={<GraduationCap size={18} />} />
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
      <NavItem href="/horario" label="Horário e Provas" icon={<CalendarClock size={18} />} />
      <NavItem href="/notas" label="Notas e Frequência" icon={<GraduationCap size={18} />} />
    </>
  );
}

function ProfessorNav() {
  return (
    <>
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
    </>
  );
}
