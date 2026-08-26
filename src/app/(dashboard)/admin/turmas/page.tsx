import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { deleteTurmaAction } from "@/actions/admin";
import { CreateTurmaForm } from "./CreateTurmaForm";
import { PERIODO_LABEL, formatAnoLetivo } from "@/lib/utils";

interface AdminTurmasPageProps {
  searchParams: Promise<{ anoLetivo?: string }>;
}

export default async function AdminTurmasPage({ searchParams }: AdminTurmasPageProps) {
  const { anoLetivo } = await searchParams;

  const [cursos, anosLetivos, maxAnoLetivo] = await Promise.all([
    // select: CreateTurmaForm (Client Component) só precisa de id/nome — ver nota em admin/disciplinas/page.tsx.
    // duracaoAnos limita os anos curriculares oferecidos ao curso escolhido.
    prisma.curso.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, duracaoAnos: true } }),
    prisma.turma.findMany({ distinct: ["anoLetivo"], select: { anoLetivo: true }, orderBy: { anoLetivo: "desc" } }),
    prisma.turma.aggregate({ _max: { anoLetivo: true } }),
  ]);

  // Por omissão só o ano letivo mais recente (o que acabou de nascer do rollover automático,
  // §pedido do cliente 2026-08-18) — as turmas de anos anteriores continuam na BD como histórico
  // (sabe-se sempre que aluno esteve em que turma em que ano), só deixam de poluir a vista do dia
  // a dia. "todos" no filtro mostra tudo, uma escolha explícita mostra só esse ano.
  const anoAtual = maxAnoLetivo._max.anoLetivo;
  const filtroAtivo = anoLetivo ?? (anoAtual !== null ? String(anoAtual) : "todos");

  const turmas = await prisma.turma.findMany({
    where: filtroAtivo === "todos" ? {} : { anoLetivo: Number(filtroAtivo) },
    include: { curso: true, _count: { select: { matriculas: true, turmaDisciplinas: true } } },
    orderBy: [{ anoLetivo: "desc" }, { curso: { nome: "asc" } }, { anoCurricular: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Turmas</h1>
        <p className="text-sm text-navy-400">
          Gestão académica — uma turma é uma coorte: Curso + Ano curricular + Período. As disciplinas são atribuídas dentro de cada turma.
          Ao fim do ano letivo, a turma do ano seguinte é criada automaticamente (mesma grelha de disciplinas/professores) — a antiga fica como histórico.
        </p>
      </div>

      <Card>
        <CardHeader title="Turmas" subtitle={`${turmas.length} turma(s)`} />
        <CardBody className="flex flex-col gap-4">
          <CreateTurmaForm cursos={cursos} />

          <form className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-navy-500">Ano letivo</label>
              <Select name="anoLetivo" defaultValue={filtroAtivo} className="w-48">
                {anoAtual !== null ? <option value={String(anoAtual)}>{formatAnoLetivo(anoAtual)} (atual)</option> : null}
                {anosLetivos
                  .filter((a) => a.anoLetivo !== anoAtual)
                  .map((a) => (
                    <option key={a.anoLetivo} value={String(a.anoLetivo)}>
                      {formatAnoLetivo(a.anoLetivo)}
                    </option>
                  ))}
                <option value="todos">Todos os anos (histórico)</option>
              </Select>
            </div>
            <button type="submit" className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800">
              Filtrar
            </button>
          </form>

          {turmas.length === 0 ? (
            <EmptyState message="Nenhuma turma cadastrada para este filtro." />
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
                    <Td>
                      {formatAnoLetivo(turma.anoLetivo)}
                      {turma.anoLetivo !== anoAtual ? (
                        <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-400">Histórico</span>
                      ) : null}
                    </Td>
                    <Td>{turma._count.turmaDisciplinas}</Td>
                    <Td>{turma._count.matriculas}</Td>
                    <Td className="text-right">
                      <DeleteButtonForm action={deleteTurmaAction} id={turma.id} />
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
