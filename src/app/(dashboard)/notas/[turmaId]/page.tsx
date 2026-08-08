import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { PERIODO_LABEL } from "@/lib/utils";

interface NotasTurmaPageProps {
  params: Promise<{ turmaId: string }>;
}

export default async function NotasTurmaPage({ params }: NotasTurmaPageProps) {
  const { turmaId } = await params;

  const turma = await prisma.turma.findUnique({
    where: { id: turmaId },
    include: {
      curso: true,
      turmaDisciplinas: {
        include: { disciplina: true, professor: true, _count: { select: { avaliacoes: true } } },
        orderBy: { disciplina: { nome: "asc" } },
      },
    },
  });

  if (!turma) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/notas" className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Turmas
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-900">
          {turma.curso.nome} - {turma.anoCurricular}º Ano
        </h1>
        <p className="text-sm text-navy-400">{PERIODO_LABEL[turma.periodo]}</p>
      </div>

      <Card>
        <CardHeader title="Disciplinas" subtitle={`${turma.turmaDisciplinas.length} disciplina(s)`} />
        {turma.turmaDisciplinas.length === 0 ? (
          <EmptyState message="Nenhuma disciplina atribuída a esta turma." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Disciplina</Th>
                <Th>Professor</Th>
                <Th>Avaliações</Th>
              </tr>
            </Thead>
            <Tbody>
              {turma.turmaDisciplinas.map((td) => (
                <Tr key={td.id}>
                  <Td>
                    <Link href={`/notas/${turma.id}/${td.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                      {td.disciplina.nome}
                    </Link>
                  </Td>
                  <Td>{td.professor.nome}</Td>
                  <Td>{td._count.avaliacoes}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
