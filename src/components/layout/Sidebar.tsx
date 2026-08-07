import { LayoutDashboard, Users, GraduationCap, ShieldCheck, ScrollText } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { NavItem } from "./NavItem";
import type { Role } from "@/generated/prisma/client";

interface SidebarProps {
  role: Role;
}

const NAV_BY_ROLE: Record<Role, { href: string; label: string; icon: React.ReactNode }[]> = {
  ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/alunos", label: "Alunos", icon: <Users size={18} /> },
    { href: "/notas", label: "Notas e Frequência", icon: <GraduationCap size={18} /> },
    { href: "/admin", label: "Admin", icon: <ShieldCheck size={18} /> },
    { href: "/auditoria", label: "Auditoria", icon: <ScrollText size={18} /> },
  ],
  SECRETARIA: [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/alunos", label: "Alunos", icon: <Users size={18} /> },
    { href: "/notas", label: "Notas e Frequência", icon: <GraduationCap size={18} /> },
  ],
  PROFESSOR: [
    { href: "/professor", label: "Minhas Turmas", icon: <GraduationCap size={18} /> },
  ],
  ALUNO: [{ href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> }],
};

export function Sidebar({ role }: SidebarProps) {
  const items = NAV_BY_ROLE[role];

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-navy-800 bg-navy-950 px-4 py-6 md:flex">
      <div className="px-2 pb-6">
        <Logo size={36} />
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>
    </aside>
  );
}
