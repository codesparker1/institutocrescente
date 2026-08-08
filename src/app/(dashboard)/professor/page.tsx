import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, GraduationCap, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { ProfileCard } from "@/components/dashboard/ProfileCard";
import { PERIODO_LABEL } from "@/lib/utils";

export default async function ProfessorPortalPage() {
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  const professor = await prisma.professor.findUnique({ where: { id: session.user.professorId } });

  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { professorId: session.user.professorId },
    include: { disciplina: true, turma: { include: { curso: true, _count: { select: { matriculas: true } } } } },
    orderBy: [{ turma: { anoCurricular: "asc" } }, { disciplina: { nome: "asc" } }],
  });

  const totalAlunos = turmaDisciplinas.reduce((sum, td) => sum + td.turma._count.matriculas, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Minhas Disciplinas</h1>
        <p className="text-sm text-navy-400">Resumo da sua atividade docente.</p>
      </div>

      {professor ? (
        <ProfileCard
          nome={professor.nome}
          cargo="Professor"
          campos={[
            { label: "Especialidade", value: professor.especialidade },
            { label: "Email", value: professor.email },
          ]}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Disciplinas" value={turmaDisciplinas.length} icon={<GraduationCap size={20} />} />
        <StatCard label="Total de alunos" value={totalAlunos} icon={<Users size={20} />} />
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

      <Card>
        <CardHeader title="Disciplinas atribuídas" subtitle={`${turmaDisciplinas.length} disciplina(s)`} />
        {turmaDisciplinas.length === 0 ? (
          <EmptyState message="Nenhuma disciplina atribuída." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Disciplina</Th>
                <Th>Curso</Th>
                <Th>Ano</Th>
                <Th>Período</Th>
                <Th>Semestre</Th>
                <Th>Alunos</Th>
              </tr>
            </Thead>
            <Tbody>
              {turmaDisciplinas.map((td) => (
                <Tr key={td.id}>
                  <Td>
                    <Link href={`/professor/${td.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                      {td.disciplina.nome}
                    </Link>
                  </Td>
                  <Td>{td.turma.curso.nome}</Td>
                  <Td>
                    <Badge tone="neutral">{td.turma.anoCurricular}º Ano</Badge>
                  </Td>
                  <Td>{PERIODO_LABEL[td.turma.periodo]}</Td>
                  <Td>{td.semestre}º Semestre</Td>
                  <Td>{td.turma._count.matriculas}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
