import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";

export default async function ProfessorPortalPage() {
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  const turmas = await prisma.turma.findMany({
    where: { professorId: session.user.professorId },
    include: { disciplina: true, _count: { select: { matriculas: true } } },
    orderBy: { nome: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Minhas Turmas</h1>
        <p className="text-sm text-navy-400">Lance notas e consulte a frequência das suas turmas.</p>
      </div>

      <Card>
        <CardHeader title="Turmas atribuídas" subtitle={`${turmas.length} turma(s)`} />
        {turmas.length === 0 ? (
          <EmptyState message="Nenhuma turma atribuída." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Turma</Th>
                <Th>Disciplina</Th>
                <Th>Alunos</Th>
                <Th>Horário</Th>
              </tr>
            </Thead>
            <Tbody>
              {turmas.map((turma) => (
                <Tr key={turma.id}>
                  <Td>
                    <Link href={`/professor/${turma.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                      {turma.nome}
                    </Link>
                  </Td>
                  <Td>{turma.disciplina.nome}</Td>
                  <Td>{turma._count.matriculas}</Td>
                  <Td>{turma.horario}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
