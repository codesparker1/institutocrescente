import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { PERIODO_LABEL, formatAnoLetivo } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

interface NotasPageProps {
  searchParams: Promise<{ cursoId?: string; anoCurricular?: string; periodo?: string; anoLetivo?: string }>;
}

const PERIODOS = ["MATUTINO", "VESPERTINO", "NOTURNO"] as const;

export default async function NotasPage({ searchParams }: NotasPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "SECRETARIA") redirect("/dashboard");

  const { cursoId, anoCurricular, periodo, anoLetivo } = await searchParams;

  // O professor só vê turmas onde lecciona pelo menos uma disciplina — antes esta página mostrava
  // a todos as turmas de todos os colegas. Admin/DAAC continuam a ver tudo (gestão académica).
  const professorId = session.user.role === "PROFESSOR" ? session.user.professorId : null;
  const escopoProfessor: Prisma.TurmaWhereInput = professorId
    ? { turmaDisciplinas: { some: { professorId } } }
    : {};

  // A contagem de disciplinas é do semestre a decorrer, para bater certo com o que a página da
  // turma mostra — que só lista esse semestre (§pedido do cliente 2026-08-29). Sem isto, a lista
  // prometia "4 disciplinas" e a página seguinte abria com 2.
  const config = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { semestreAtual: true },
  });
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;

  // As opções dos filtros saem do que este utilizador pode mesmo ver, não do catálogo inteiro:
  // sem isto o professor teria no dropdown cursos e anos letivos sem uma única turma sua.
  const turmasVisiveis = await prisma.turma.findMany({
    where: escopoProfessor,
    select: { anoLetivo: true, anoCurricular: true, curso: { select: { id: true, nome: true } } },
  });

  const cursosDisponiveis = [...new Map(turmasVisiveis.map((t) => [t.curso.id, t.curso])).values()].sort((a, b) =>
    a.nome.localeCompare(b.nome),
  );
  const anosCurricularesDisponiveis = [...new Set(turmasVisiveis.map((t) => t.anoCurricular))].sort((a, b) => a - b);
  const anosLetivosDisponiveis = [...new Set(turmasVisiveis.map((t) => t.anoLetivo))].sort((a, b) => b - a);

  // Por omissão só o ano letivo mais recente — mesmo raciocínio de Admin > Turmas: o rollover
  // automático cria turmas novas todos os anos, e sem isto o ecrã cresce indefinidamente.
  const anoLetivoMaisRecente = anosLetivosDisponiveis[0] ?? null;
  const filtroAnoLetivo = anoLetivo ?? (anoLetivoMaisRecente !== null ? String(anoLetivoMaisRecente) : "todos");

  const turmas = await prisma.turma.findMany({
    where: {
      ...escopoProfessor,
      ...(cursoId ? { cursoId } : {}),
      ...(anoCurricular ? { anoCurricular: Number(anoCurricular) } : {}),
      ...(periodo ? { periodo: periodo as (typeof PERIODOS)[number] } : {}),
      ...(filtroAnoLetivo === "todos" ? {} : { anoLetivo: Number(filtroAnoLetivo) }),
    },
    include: {
      curso: true,
      // Para o professor, as contagens mostram só o que é dele — ver a coluna "Disciplinas".
      _count: {
        select: {
          matriculas: true,
          turmaDisciplinas: { where: { semestre: semestreAtual, ...(professorId ? { professorId } : {}) } },
        },
      },
    },
    orderBy: [{ anoLetivo: "desc" }, { curso: { nome: "asc" } }, { anoCurricular: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Notas e Frequência</h1>
        <p className="text-sm text-navy-400">
          {professorId
            ? "As turmas onde lecciona. Selecione uma para ver as suas disciplinas."
            : "Selecione uma turma para ver as suas disciplinas."}
        </p>
      </div>

      <Card>
        <CardHeader title="Turmas" subtitle={`${turmas.length} turma(s)`} />
        <CardBody className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-navy-500">Curso</label>
              <Select name="cursoId" defaultValue={cursoId ?? ""} className="w-56">
                <option value="">Todos</option>
                {cursosDisponiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-navy-500">Ano curricular</label>
              <Select name="anoCurricular" defaultValue={anoCurricular ?? ""} className="w-36">
                <option value="">Todos</option>
                {anosCurricularesDisponiveis.map((ano) => (
                  <option key={ano} value={String(ano)}>
                    {ano}º Ano
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-navy-500">Período</label>
              <Select name="periodo" defaultValue={periodo ?? ""} className="w-40">
                <option value="">Todos</option>
                {PERIODOS.map((p) => (
                  <option key={p} value={p}>
                    {PERIODO_LABEL[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-navy-500">Ano letivo</label>
              <Select name="anoLetivo" defaultValue={filtroAnoLetivo} className="w-44">
                {anosLetivosDisponiveis.map((ano) => (
                  <option key={ano} value={String(ano)}>
                    {formatAnoLetivo(ano)}
                    {ano === anoLetivoMaisRecente ? " (atual)" : ""}
                  </option>
                ))}
                <option value="todos">Todos os anos</option>
              </Select>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800"
            >
              Filtrar
            </button>
            <Link
              href="/notas"
              className="rounded-lg border border-navy-100 px-4 py-2 text-sm font-semibold text-navy-600 hover:bg-navy-50"
            >
              Limpar
            </Link>
          </form>

          {turmas.length === 0 ? (
            <EmptyState
              message={
                professorId && turmasVisiveis.length === 0
                  ? "Ainda não tem nenhuma disciplina atribuída."
                  : "Nenhuma turma corresponde a este filtro."
              }
            />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Curso</Th>
                  <Th>Ano</Th>
                  <Th>Período</Th>
                  <Th>Ano letivo</Th>
                  <Th>Disciplinas ({semestreAtual}º sem.)</Th>
                  <Th>Alunos</Th>
                </tr>
              </Thead>
              <Tbody>
                {turmas.map((turma) => (
                  <Tr key={turma.id}>
                    <Td>
                      <Link href={`/notas/${turma.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                        {turma.curso.nome}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone="neutral">{turma.anoCurricular}º Ano</Badge>
                    </Td>
                    <Td>{PERIODO_LABEL[turma.periodo]}</Td>
                    <Td>{formatAnoLetivo(turma.anoLetivo)}</Td>
                    <Td>{turma._count.turmaDisciplinas}</Td>
                    <Td>{turma._count.matriculas}</Td>
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
