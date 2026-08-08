import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { PERIODO_LABEL } from "@/lib/utils";

export default async function NotasPage() {
  const turmas = await prisma.turma.findMany({
    include: {
      disciplina: true,
      professor: true,
      _count: { select: { matriculas: true } },
    },
    orderBy: [{ anoCurricular: "asc" }, { nome: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Notas e Frequência</h1>
        <p className="text-sm text-navy-400">Selecione uma turma para lançar notas e ver a frequência.</p>
      </div>

      <Card>
        <CardHeader title="Turmas" subtitle={`${turmas.length} turma(s)`} />
        {turmas.length === 0 ? (
          <EmptyState message="Nenhuma turma cadastrada." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Turma</Th>
                <Th>Disciplina</Th>
                <Th>Professor</Th>
                <Th>Ano</Th>
                <Th>Período</Th>
                <Th>Alunos</Th>
              </tr>
            </Thead>
            <Tbody>
              {turmas.map((turma) => (
                <Tr key={turma.id}>
                  <Td>
                    <Link href={`/notas/${turma.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                      {turma.nome}
                    </Link>
                  </Td>
                  <Td>{turma.disciplina.nome}</Td>
                  <Td>{turma.professor.nome}</Td>
                  <Td>
                    <Badge tone="neutral">{turma.anoCurricular}º Ano</Badge>
                  </Td>
                  <Td>{PERIODO_LABEL[turma.periodo]}</Td>
                  <Td>{turma._count.matriculas}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
