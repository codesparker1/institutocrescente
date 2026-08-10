import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { PERIODO_LABEL } from "@/lib/utils";

export default async function ProfessorDisciplinasPage() {
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { professorId: session.user.professorId },
    include: { disciplina: true, turma: { include: { curso: true, _count: { select: { matriculas: true } } } } },
    orderBy: [{ turma: { anoCurricular: "asc" } }, { disciplina: { nome: "asc" } }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Minhas Disciplinas</h1>
        <p className="text-sm text-navy-400">Selecione uma disciplina para lançar notas e frequência.</p>
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
