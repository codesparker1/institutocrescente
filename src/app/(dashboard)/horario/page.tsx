import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/Table";
import { TurmaHorarioCard } from "@/components/horario/TurmaHorarioCard";

const TURMA_INCLUDE = {
  disciplina: true,
  professor: true,
  horarioSlots: true,
  avaliacoes: true,
} as const;

export default async function HorarioPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { role } = session.user;
  let turmas;
  let editable = false;
  let subtitle = "";

  if (role === "ADMIN") {
    turmas = await prisma.turma.findMany({
      include: TURMA_INCLUDE,
      orderBy: [{ anoCurricular: "asc" }, { nome: "asc" }],
    });
    editable = true;
    subtitle = "Gerir horário de aulas e provas de todas as turmas.";
  } else if (role === "SECRETARIA") {
    turmas = await prisma.turma.findMany({
      include: TURMA_INCLUDE,
      orderBy: [{ anoCurricular: "asc" }, { nome: "asc" }],
    });
    subtitle = "Consulta do horário de aulas e provas de todas as turmas.";
  } else if (role === "PROFESSOR") {
    if (!session.user.professorId) redirect("/dashboard");
    turmas = await prisma.turma.findMany({
      where: { professorId: session.user.professorId },
      include: TURMA_INCLUDE,
      orderBy: [{ anoCurricular: "asc" }, { nome: "asc" }],
    });
    subtitle = "Horário das suas disciplinas.";
  } else {
    if (!session.user.alunoId) redirect("/dashboard");
    const matriculas = await prisma.matricula.findMany({
      where: { alunoId: session.user.alunoId, status: "ATIVA" },
      include: { turma: { include: TURMA_INCLUDE } },
    });
    turmas = matriculas.map((m) => m.turma);
    subtitle = "O seu horário de aulas e provas.";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Horário</h1>
        <p className="text-sm text-navy-400">{subtitle}</p>
      </div>

      {turmas.length === 0 ? (
        <EmptyState message="Sem turmas para mostrar." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {turmas.map((turma) => (
            <TurmaHorarioCard key={turma.id} turma={turma} editable={editable} />
          ))}
        </div>
      )}
    </div>
  );
}
