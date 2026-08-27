import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { PERIODO_LABEL, nomeProfessor } from "@/lib/utils";

interface NotasTurmaPageProps {
  params: Promise<{ turmaId: string }>;
}

export default async function NotasTurmaPage({ params }: NotasTurmaPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "SECRETARIA") redirect("/dashboard");

  const { turmaId } = await params;

  // O professor só vê as suas próprias disciplinas dentro da turma — não a grelha inteira dos
  // colegas. Admin/DAAC continuam a ver todas (gestão académica).
  const professorId = session.user.role === "PROFESSOR" ? session.user.professorId : null;

  const turma = await prisma.turma.findUnique({
    where: { id: turmaId },
    include: {
      curso: true,
      turmaDisciplinas: {
        where: professorId ? { professorId } : {},
        include: { disciplina: true, professor: true, _count: { select: { avaliacoes: true } } },
        orderBy: { disciplina: { nome: "asc" } },
      },
    },
  });

  if (!turma) notFound();
  // Turma sem nenhuma disciplina deste professor não é dele — 404 em vez de uma página vazia que
  // confirmaria a existência da turma (mesma razão de não distinguir "não existe" de "não é seu").
  if (professorId && turma.turmaDisciplinas.length === 0) notFound();

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
                  <Td className={td.professor ? undefined : "text-navy-400 italic"}>{nomeProfessor(td.professor)}</Td>
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
