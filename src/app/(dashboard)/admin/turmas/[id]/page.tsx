import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { deleteTurmaDisciplinaAction } from "@/actions/admin";
import { CreateTurmaDisciplinaForm } from "./CreateTurmaDisciplinaForm";
import { EditarProfessorTurmaDisciplina } from "./EditarProfessorTurmaDisciplina";
import { PERIODO_LABEL, formatAnoLetivo } from "@/lib/utils";

interface AdminTurmaDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTurmaDetailPage({ params }: AdminTurmaDetailPageProps) {
  const { id } = await params;

  const turma = await prisma.turma.findUnique({
    where: { id },
    include: {
      curso: true,
      turmaDisciplinas: {
        include: { disciplina: true, professor: true, _count: { select: { avaliacoes: true, horarioSlots: true } } },
        orderBy: { disciplina: { nome: "asc" } },
      },
    },
  });

  if (!turma) notFound();

  const [professores, cadeirasCurriculares] = await Promise.all([
    prisma.professor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    // select: CreateTurmaDisciplinaForm (Client Component) só precisa de id/semestre/disciplina.nome
    // — CadeiraCurricular.notaMinimaDispensa é Decimal, ver nota em admin/disciplinas/page.tsx.
    prisma.cadeiraCurricular.findMany({
      where: { cursoId: turma.cursoId, anoCurricular: turma.anoCurricular },
      select: { id: true, semestre: true, disciplina: { select: { nome: true } } },
      orderBy: [{ semestre: "asc" }, { disciplina: { nome: "asc" } }],
    }),
  ]);
  const cadeirasAtribuidas = new Set(turma.turmaDisciplinas.map((td) => td.cadeiraCurricularId));
  const cadeirasDisponiveis = cadeirasCurriculares.filter((c) => !cadeirasAtribuidas.has(c.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/turmas" className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Turmas
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-900">
          {turma.curso.nome} - {turma.anoCurricular}º Ano
        </h1>
        <p className="text-sm text-navy-400">
          {PERIODO_LABEL[turma.periodo]} · {formatAnoLetivo(turma.anoLetivo)}
        </p>
      </div>

      <Card>
        <CardHeader title="Disciplinas desta turma" subtitle="Atribua disciplinas e professores" />
        <CardBody className="flex flex-col gap-4">
          {cadeirasCurriculares.length === 0 ? (
            <p className="text-sm text-navy-400">
              Este curso ainda não tem cadeiras definidas para o {turma.anoCurricular}º ano no plano curricular. Defina-as
              primeiro em{" "}
              <Link href="/admin/curriculo" className="underline hover:text-navy-600">
                Plano Curricular
              </Link>
              .
            </p>
          ) : cadeirasDisponiveis.length === 0 ? (
            <p className="text-sm text-navy-400">Todas as cadeiras deste ano já foram atribuídas a esta turma.</p>
          ) : (
            <CreateTurmaDisciplinaForm
              turmaId={turma.id}
              cadeirasCurriculares={cadeirasDisponiveis}
              professores={professores}
            />
          )}

          {turma.turmaDisciplinas.length === 0 ? (
            <EmptyState message="Nenhuma disciplina atribuída ainda." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Disciplina</Th>
                  <Th>Professor</Th>
                  <Th>Semestre</Th>
                  <Th>Sala</Th>
                  <Th>Horários</Th>
                  <Th>Provas</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {turma.turmaDisciplinas.map((td) => (
                  <Tr key={td.id}>
                    <Td className="font-medium text-navy-900">{td.disciplina.nome}</Td>
                    <Td>
                      <EditarProfessorTurmaDisciplina
                        turmaDisciplinaId={td.id}
                        professorAtualId={td.professorId}
                        professores={professores}
                      />
                    </Td>
                    <Td>{td.semestre}º Semestre</Td>
                    <Td>{td.sala}</Td>
                    <Td>{td._count.horarioSlots}</Td>
                    <Td>{td._count.avaliacoes}</Td>
                    <Td className="text-right">
                      <form action={deleteTurmaDisciplinaAction}>
                        <input type="hidden" name="id" value={td.id} />
                        <button type="submit" className="rounded-md p-1.5 text-navy-300 hover:bg-red-50 hover:text-red-600" aria-label="Remover">
                          <Trash2 size={15} />
                        </button>
                      </form>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}

          <p className="text-xs text-navy-400">
            Para definir o horário semanal e agendar provas de cada disciplina, use a página{" "}
            <Link href="/horario" className="underline hover:text-navy-600">
              Horário e Provas
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
