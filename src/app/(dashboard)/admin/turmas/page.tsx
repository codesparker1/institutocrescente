import Link from "next/link";
import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { deleteTurmaAction } from "@/actions/admin";
import { CreateTurmaForm } from "./CreateTurmaForm";
import { PERIODO_LABEL } from "@/lib/utils";

export default async function AdminTurmasPage() {
  const [cursos, turmas] = await Promise.all([
    prisma.curso.findMany({ orderBy: { nome: "asc" } }),
    prisma.turma.findMany({
      include: { curso: true, _count: { select: { matriculas: true, turmaDisciplinas: true } } },
      orderBy: [{ curso: { nome: "asc" } }, { anoCurricular: "asc" }],
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Turmas</h1>
        <p className="text-sm text-navy-400">
          Gestão académica — uma turma é uma coorte: Curso + Ano curricular + Período. As disciplinas são atribuídas dentro de cada turma.
        </p>
      </div>

      <Card>
        <CardHeader title="Turmas" subtitle={`${turmas.length} turma(s)`} />
        <CardBody className="flex flex-col gap-4">
          <CreateTurmaForm cursos={cursos} />

          {turmas.length === 0 ? (
            <EmptyState message="Nenhuma turma cadastrada." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Curso</Th>
                  <Th>Ano</Th>
                  <Th>Período</Th>
                  <Th>Ano letivo</Th>
                  <Th>Disciplinas</Th>
                  <Th>Alunos</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {turmas.map((turma) => (
                  <Tr key={turma.id}>
                    <Td>
                      <Link href={`/admin/turmas/${turma.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                        {turma.curso.nome}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone="neutral">{turma.anoCurricular}º Ano</Badge>
                    </Td>
                    <Td>{PERIODO_LABEL[turma.periodo]}</Td>
                    <Td>{turma.anoLetivo}</Td>
                    <Td>{turma._count.turmaDisciplinas}</Td>
                    <Td>{turma._count.matriculas}</Td>
                    <Td className="text-right">
                      <form action={deleteTurmaAction}>
                        <input type="hidden" name="id" value={turma.id} />
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
        </CardBody>
      </Card>
    </div>
  );
}
