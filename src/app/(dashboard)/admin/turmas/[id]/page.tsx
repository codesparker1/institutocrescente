import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createTurmaDisciplinaAction, deleteTurmaDisciplinaAction } from "@/actions/admin";
import { PERIODO_LABEL } from "@/lib/utils";

interface AdminTurmaDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTurmaDetailPage({ params }: AdminTurmaDetailPageProps) {
  const { id } = await params;

  const turma = await prisma.turma.findUnique({
    where: { id },
    include: {
      curso: { include: { disciplinas: true } },
      turmaDisciplinas: {
        include: { disciplina: true, professor: true, _count: { select: { avaliacoes: true, horarioSlots: true } } },
        orderBy: { disciplina: { nome: "asc" } },
      },
    },
  });

  if (!turma) notFound();

  const professores = await prisma.professor.findMany({ orderBy: { nome: "asc" } });
  const disciplinasAtribuidas = new Set(turma.turmaDisciplinas.map((td) => td.disciplinaId));
  const disciplinasDisponiveis = turma.curso.disciplinas.filter((d) => !disciplinasAtribuidas.has(d.id));

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
          {PERIODO_LABEL[turma.periodo]} · {turma.anoLetivo}
        </p>
      </div>

      <Card>
        <CardHeader title="Disciplinas desta turma" subtitle="Atribua disciplinas e professores" />
        <CardBody className="flex flex-col gap-4">
          {disciplinasDisponiveis.length === 0 ? (
            <p className="text-sm text-navy-400">Todas as disciplinas do curso já foram atribuídas a esta turma.</p>
          ) : (
            <form action={createTurmaDisciplinaAction} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
              <input type="hidden" name="turmaId" value={turma.id} />
              <Field label="Disciplina" htmlFor="td-disciplina">
                <Select id="td-disciplina" name="disciplinaId" required>
                  {disciplinasDisponiveis.map((disciplina) => (
                    <option key={disciplina.id} value={disciplina.id}>
                      {disciplina.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Professor" htmlFor="td-professor">
                <Select id="td-professor" name="professorId" required>
                  {professores.map((professor) => (
                    <option key={professor.id} value={professor.id}>
                      {professor.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Semestre" htmlFor="td-semestre">
                <Select id="td-semestre" name="semestre" required defaultValue="1">
                  <option value="1">1º Semestre</option>
                  <option value="2">2º Semestre</option>
                </Select>
              </Field>
              <Field label="Sala" htmlFor="td-sala">
                <Input id="td-sala" name="sala" required placeholder="Sala 3" />
              </Field>
              <Button type="submit">Atribuir</Button>
            </form>
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
                    <Td>{td.professor.nome}</Td>
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
