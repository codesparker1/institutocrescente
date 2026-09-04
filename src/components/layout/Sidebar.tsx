"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, GraduationCap, Layers, ScrollText, CalendarClock, ClipboardList, Wallet, AlertTriangle, MessageSquareWarning, Clock } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { NavItem } from "./NavItem";
import { NavGroup } from "./NavGroup";
import { AcessibilidadeSlider } from "./AcessibilidadeSlider";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/client";

interface SidebarProps {
  role: Role;
  isOpen: boolean;
  onClose: () => void;
  simulationMode: boolean;
  /**
   * Aluno inscrito numa monografia (§2026-09-04) — só a esses se mostra "Meu Orientador". Mostrar
   * o item a um aluno de 1º ano seria oferecer uma página que só lhe pode dizer "ainda não tem".
   */
  temMonografia?: boolean;
}

export function Sidebar({ role, isOpen, onClose, simulationMode, temMonografia = false }: SidebarProps) {
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
          {role === "ALUNO" ? <AlunoNav temMonografia={temMonografia} /> : null}
          {role === "DAAC" ? <DaacNav /> : null}
          {role === "DEV" ? <DevNav simulationMode={simulationMode} /> : null}
        </nav>
        {/* Só quem acede ao Registo de Pagamentos (a página pensada para acessibilidade) precisa disto. */}
        {role === "ADMIN" || role === "SECRETARIA" ? <AcessibilidadeSlider /> : null}
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
          { href: "/admin/academico/configuracao", label: "Configuração Académica" },
          { href: "/admin/cursos", label: "Cursos" },
          { href: "/admin/disciplinas", label: "Disciplinas" },
          { href: "/admin/finalistas", label: "Finalistas" },
          { href: "/admin/curriculo", label: "Plano Curricular" },
          { href: "/admin/turmas", label: "Turmas" },
          { href: "/admin/emolumentos", label: "Emolumentos" },
          { href: "/admin/precos", label: "Preços de Propina" },
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
      {/* Gestão das reclamações de todos passou a ser exclusiva do papel DEV (§pedido do cliente
          2026-08-18) — ADMIN agora só envia, como Secretaria/Professor/Aluno, ver DevNav abaixo. */}
      <NavItem href="/reclamacoes" label="Reclamações" icon={<MessageSquareWarning size={18} />} />
      <NavGroup
        label="Usuários"
        icon={<Users size={18} />}
        items={[
          { href: "/admin/professores", label: "Professores" },
          { href: "/admin/equipa", label: "Equipa (DAAC/Secretaria/Dev)" },
          { href: "/alunos", label: "Gestão de Matrícula" },
        ]}
      />
    </>
  );
}

// Registo de Pagamentos fica logo a seguir à Página Inicial — a pedido explícito, é a página do
// dia a dia da secretaria, com um tratamento visual mais acessível (letras maiores, mais espaço)
// para se distinguir claramente da Página Inicial. Ver RegistoPagamentosBusca.
function SecretariaNav() {
  return (
    <>
      <NavItem href="/dashboard" label="Página Inicial" icon={<LayoutDashboard size={18} />} />
      <NavItem href="/financeiro/registo" label="Registo de Pagamentos" icon={<Wallet size={18} />} />
      <NavItem href="/alunos" label="Gestão de Matrícula" icon={<Users size={18} />} />
      <NavItem href="/financeiro/devedores" label="Lista de Devedores" icon={<AlertTriangle size={18} />} />
      <NavItem href="/reclamacoes" label="Reclamações" icon={<MessageSquareWarning size={18} />} />
    </>
  );
}

function ProfessorNav() {
  return (
    <>
      <NavItem href="/dashboard" label="Página Inicial" icon={<LayoutDashboard size={18} />} />
      <NavItem href="/professor" label="Minhas Disciplinas" icon={<GraduationCap size={18} />} />
      <NavItem href="/horario" label="Meu Horário" icon={<CalendarClock size={18} />} />
      {/* Sempre visível, ao contrário de "Meu Orientador" no aluno: qualquer professor pode vir a
          ser orientador, e a página explica-se sozinha quando ainda não tem orientandos. */}
      <NavItem href="/professor/orientandos" label="Meus Orientandos" icon={<Users size={18} />} />
      <NavItem href="/reclamacoes" label="Reclamações" icon={<MessageSquareWarning size={18} />} />
    </>
  );
}

// Domínio do DAAC (§3): currículo, horário/provas e notas, mais Gestão de Estudante (2026-08-18 —
// esquecido no pedido original de aproveitamento/histórico/documentos, sem isto inalcançável).
// Continua sem Financeiro: /alunos mostra a Situação Financeira em modo leitura só
// (podeRegistarPagamento continua ADMIN/SECRETARIA só, ver src/lib/permissions.ts).
function DaacNav() {
  return (
    <>
      <NavItem href="/dashboard" label="Página Inicial" icon={<LayoutDashboard size={18} />} />
      <NavGroup
        label="Gestão Académica"
        icon={<Layers size={18} />}
        items={[
          { href: "/admin/academico/configuracao", label: "Configuração Académica" },
          { href: "/admin/cursos", label: "Cursos" },
          { href: "/admin/disciplinas", label: "Disciplinas" },
          { href: "/admin/finalistas", label: "Finalistas" },
          { href: "/admin/curriculo", label: "Plano Curricular" },
          { href: "/admin/turmas", label: "Turmas" },
          { href: "/admin/emolumentos", label: "Emolumentos" },
          { href: "/admin/precos", label: "Preços de Propina" },
        ]}
      />
      <NavItem href="/horario" label="Horário e Provas" icon={<CalendarClock size={18} />} />
      <NavItem href="/notas" label="Notas e Frequência" icon={<GraduationCap size={18} />} />
      <NavItem href="/alunos" label="Gestão de Estudante" icon={<Users size={18} />} />
    </>
  );
}

// Papel DEV (§pedido do cliente 2026-08-18): recebe reclamações/sugestões de todos os outros
// papéis, e é também quem opera o relógio simulado (conta pessoal do responsável técnico) — as
// duas únicas capacidades do papel, nenhuma outra no sistema.
function DevNav({ simulationMode }: { simulationMode: boolean }) {
  return (
    <>
      <NavItem href="/admin/reclamacoes" label="Reclamações e Sugestões" icon={<MessageSquareWarning size={18} />} />
      {/* Só existe com SIMULATION_MODE=true (teste de vários anos com tempo acelerado) — ver src/lib/tempo.ts. */}
      {simulationMode ? <NavItem href="/admin/relogio" label="Relógio Simulado" icon={<Clock size={18} />} /> : null}
    </>
  );
}

function AlunoNav({ temMonografia }: { temMonografia: boolean }) {
  return (
    <>
      <NavItem href="/dashboard" label="Página Inicial" icon={<LayoutDashboard size={18} />} />
      <NavItem href="/horario" label="Meu Horário" icon={<CalendarClock size={18} />} />
      {/* Só a finalistas — ver a nota em SidebarProps.temMonografia. */}
      {temMonografia ? (
        <NavItem href="/meu-orientador" label="Meu Orientador" icon={<Users size={18} />} />
      ) : null}
      <NavItem href="/minhas-notas" label="Minhas Notas" icon={<ClipboardList size={18} />} />
      <NavItem href="/reclamacoes" label="Reclamações" icon={<MessageSquareWarning size={18} />} />
      <NavGroup
        label="Minhas Finanças"
        icon={<Wallet size={18} />}
        items={[
          { href: "/financeiro", label: "Minhas Propinas" },
          { href: "/financeiro/emolumentos", label: "Catálogo de Emolumentos" },
        ]}
      />
    </>
  );
}
