import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { podeRegistarPagamento } from "@/lib/permissions";
import { getAgora } from "@/lib/tempo";
import { formatDate, parseIntParam } from "@/lib/utils";
import type { AlunoStatus, CategoriaEstudante, Prisma } from "@/generated/prisma/client";

const STATUS_TONE: Record<AlunoStatus, "success" | "warning" | "neutral" | "danger"> = {
  ATIVO: "success",
  TRANCADO: "warning",
  FORMADO: "neutral",
  DESISTENTE: "danger",
};

const CATEGORIA_LABEL: Record<CategoriaEstudante, string> = {
  NORMAL: "Normal",
  BOLSEIRO_INAGBE: "Bolseiro INAGBE",
  COMPARTICIPADA: "Comparticipada",
};

const CATEGORIA_TONE: Record<CategoriaEstudante, "neutral" | "info"> = {
  NORMAL: "neutral",
  BOLSEIRO_INAGBE: "info",
  COMPARTICIPADA: "info",
};

const TAMANHO_PAGINA = 25;

interface AlunosPageProps {
  searchParams: Promise<{ q?: string; curso?: string; ano?: string; periodo?: string; pagina?: string }>;
}

export default async function AlunosPage({ searchParams }: AlunosPageProps) {
  const { q, curso, ano, periodo, pagina } = await searchParams;
  const paginaAtual = Math.max(1, parseIntParam(pagina) ?? 1);

  const session = await auth();
  // Nova matrícula é domínio financeiro/secretaria (createAlunoAction exige podeRegistarPagamento)
  // — escondido do DAAC para não mostrar um botão que leva sempre a "sem permissão".
  const podeMatricular = session?.user ? podeRegistarPagamento(session.user) : false;

  // Estado da janela de matrícula lido uma vez no render — o botão fica desativado fora dela
  // (a mesma regra que createAlunoAction impõe no submit), com aviso do porquê e de quando abre.
  const configJanela = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { matriculaInicio: true, matriculaFim: true },
  });
  const agoraJanela = await getAgora();
  const janelaAberta =
    Boolean(configJanela?.matriculaInicio && configJanela?.matriculaFim) &&
    agoraJanela >= configJanela!.matriculaInicio! &&
    agoraJanela <= configJanela!.matriculaFim!;
  const avisoJanela = !configJanela?.matriculaInicio || !configJanela?.matriculaFim
    ? "Período de matrícula não configurado — defina-o em Admin > Configuração Académica."
    : janelaAberta
      ? null
      : agoraJanela < configJanela.matriculaInicio
        ? `Fora do período de matrícula — abre a ${formatDate(configJanela.matriculaInicio)}.`
        : `Fora do período de matrícula — encerrou a ${formatDate(configJanela.matriculaFim)}.`;

  const cursos = await prisma.curso.findMany({ orderBy: { nome: "asc" } });

  const where: Prisma.AlunoWhereInput = {};
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { numeroEstudante: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (curso) where.curso = curso;
  const anoCurricular = parseIntParam(ano);
  if (anoCurricular !== undefined) where.anoCurricular = anoCurricular;
  if (periodo) {
    where.matriculas = { some: { status: "ATIVA", turma: { periodo: periodo as "MATUTINO" | "VESPERTINO" | "NOTURNO" } } };
  }

  const totalAlunos = await prisma.aluno.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(totalAlunos / TAMANHO_PAGINA));
  // Uma página fora do intervalo (bookmark antigo, filtro que reduziu os resultados) volta à última
  // válida em vez de devolver uma lista vazia sem explicação.
  const paginaValida = Math.min(paginaAtual, totalPaginas);

  const alunos = await prisma.aluno.findMany({
    where,
    orderBy: { nome: "asc" },
    take: TAMANHO_PAGINA,
    skip: (paginaValida - 1) * TAMANHO_PAGINA,
  });

  const queryBase = new URLSearchParams();
  if (q) queryBase.set("q", q);
  if (curso) queryBase.set("curso", curso);
  if (ano) queryBase.set("ano", ano);
  if (periodo) queryBase.set("periodo", periodo);

  function hrefParaPagina(p: number): string {
    const query = new URLSearchParams(queryBase);
    query.set("pagina", String(p));
    return `/alunos?${query.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Gestão de Matrícula</h1>
          <p className="text-sm text-navy-400">Matrículas e gestão do percurso académico.</p>
        </div>
        {podeMatricular ? (
          <div className="flex flex-col items-end gap-1">
            <Link
              href="/alunos/novo"
              aria-disabled={!janelaAberta}
              className={janelaAberta ? "" : "pointer-events-none opacity-50"}
              title={avisoJanela ?? undefined}
            >
              <Button variant="primary" disabled={!janelaAberta}>
                <Plus size={16} />
                Nova matrícula
              </Button>
            </Link>
            {avisoJanela ? <p className="text-xs text-navy-400">{avisoJanela}</p> : null}
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader
          title="Lista de alunos"
          subtitle={
            totalAlunos === 0
              ? "0 resultados"
              : `A mostrar ${(paginaValida - 1) * TAMANHO_PAGINA + 1}–${Math.min(paginaValida * TAMANHO_PAGINA, totalAlunos)} de ${totalAlunos}`
          }
        />
        <CardBody className="flex flex-col gap-4">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
            <Input type="search" name="q" defaultValue={q} placeholder="Nome, nº ou email..." className="sm:col-span-2" />
            <Select name="curso" defaultValue={curso ?? ""}>
              <option value="">Todos os cursos</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <Select name="ano" defaultValue={ano ?? ""}>
              <option value="">Todos os anos</option>
              {[1, 2, 3, 4, 5, 6].map((a) => (
                <option key={a} value={a}>
                  {a}º Ano
                </option>
              ))}
            </Select>
            <Select name="periodo" defaultValue={periodo ?? ""}>
              <option value="">Todos os períodos</option>
              <option value="MATUTINO">Matutino</option>
              <option value="VESPERTINO">Vespertino</option>
              <option value="NOTURNO">Noturno</option>
            </Select>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 sm:col-span-5 sm:w-fit"
            >
              Filtrar
            </button>
          </form>

          {alunos.length === 0 ? (
            <EmptyState message="Nenhum aluno encontrado." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Nº Estudante</Th>
                  <Th>Nome</Th>
                  <Th>Curso</Th>
                  <Th>Ano</Th>
                  <Th>Categoria</Th>
                  <Th>Estado</Th>
                  <Th>Registado em</Th>
                </tr>
              </Thead>
              <Tbody>
                {alunos.map((aluno) => (
                  <Tr key={aluno.id}>
                    <Td className="font-mono text-xs">{aluno.numeroEstudante}</Td>
                    <Td>
                      <Link href={`/alunos/${aluno.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                        {aluno.nome}
                      </Link>
                    </Td>
                    <Td>{aluno.curso}</Td>
                    <Td>{aluno.anoCurricular}º Ano</Td>
                    <Td>
                      <Badge tone={CATEGORIA_TONE[aluno.categoria]}>{CATEGORIA_LABEL[aluno.categoria]}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[aluno.status]}>{aluno.status}</Badge>
                    </Td>
                    <Td>{formatDate(aluno.createdAt)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}

          {totalPaginas > 1 ? (
            <div className="flex items-center justify-between border-t border-navy-50 pt-4">
              <Link
                href={hrefParaPagina(paginaValida - 1)}
                aria-disabled={paginaValida <= 1}
                className={`flex items-center gap-1 rounded-lg border border-navy-100 px-3 py-1.5 text-sm font-medium ${
                  paginaValida <= 1 ? "pointer-events-none text-navy-200" : "text-navy-600 hover:bg-navy-50"
                }`}
              >
                <ChevronLeft size={16} />
                Anterior
              </Link>
              <span className="text-sm text-navy-400">
                Página {paginaValida} de {totalPaginas}
              </span>
              <Link
                href={hrefParaPagina(paginaValida + 1)}
                aria-disabled={paginaValida >= totalPaginas}
                className={`flex items-center gap-1 rounded-lg border border-navy-100 px-3 py-1.5 text-sm font-medium ${
                  paginaValida >= totalPaginas ? "pointer-events-none text-navy-200" : "text-navy-600 hover:bg-navy-50"
                }`}
              >
                Seguinte
                <ChevronRight size={16} />
              </Link>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
