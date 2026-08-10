import Link from "next/link";
import { CalendarClock, GraduationCap, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/Table";
import { ProfileCard } from "./ProfileCard";

interface ProfessorDashboardProps {
  professorId: string;
}

export async function ProfessorDashboard({ professorId }: ProfessorDashboardProps) {
  const professor = await prisma.professor.findUnique({ where: { id: professorId } });

  if (!professor) {
    return <EmptyState message="Professor não encontrado." />;
  }

  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { professorId },
    include: { turma: { include: { _count: { select: { matriculas: true } } } } },
  });

  const totalAlunos = turmaDisciplinas.reduce((sum, td) => sum + td.turma._count.matriculas, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Página Inicial</h1>
        <p className="text-sm text-navy-400">Olá, {professor.nome.split(" ")[0]}. Aqui está o resumo da sua atividade docente.</p>
      </div>

      <ProfileCard
        nome={professor.nome}
        cargo="Professor"
        campos={[
          { label: "Especialidade", value: professor.especialidade },
          { label: "Email", value: professor.email },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Disciplinas" value={turmaDisciplinas.length} icon={<GraduationCap size={20} />} />
        <StatCard label="Total de alunos" value={totalAlunos} icon={<Users size={20} />} />

        <Link href="/professor">
          <Card className="flex h-full items-center gap-4 px-5 py-4 transition-colors hover:border-navy-300">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
              <GraduationCap size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Ver</p>
              <p className="text-lg font-bold text-navy-900">Minhas Disciplinas</p>
            </div>
          </Card>
        </Link>

        <Link href="/horario">
          <Card className="flex h-full items-center gap-4 px-5 py-4 transition-colors hover:border-navy-300">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
              <CalendarClock size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Ver</p>
              <p className="text-lg font-bold text-navy-900">Meu Horário</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
